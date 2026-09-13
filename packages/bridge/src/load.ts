// Loading an adapter: the crate and its test manifest as one graph, each parsed
// with its own location as base, so every link between them is a walk through
// the graph rather than a match on a file name.
import jsonld from "jsonld";
import * as N3 from "n3";
import roCrate12 from "./contexts/ro-crate-1.2.json" with { type: "json" };
import { BRIDGE, MF, RDF, RDF_TYPE, SCHEMA, decode, parseTurtle } from "./rdf.ts";
import type { Resolver } from "./resolver-types.ts";

// The contexts a crate may name, bundled: loading an adapter fetches nothing.
const CONTEXTS: Record<string, unknown> = {
  "https://w3id.org/ro/crate/1.2/context": roCrate12,
};

async function documentLoader(url: string) {
  const document = CONTEXTS[url];
  if (!document) throw new Error(`the crate names a context this Bridge does not bundle, and nothing is fetched: ${url}`);
  return { contextUrl: null, document, documentUrl: url };
}

export interface Envelope {
  iri: string;
  name?: string;
  rootElement?: string;
}

export interface Adapter {
  /** The crate's root entity, the adapter. */
  root: string;
  crate: string;
  graph: N3.Store;
  identifier?: string;
  unit?: string;
  profilesRequired: string[];
  mappings: string[];
  findingsQueries: string[];
  detectQuery?: string;
  tables: string[];
  envelopes: Envelope[];
  manifest: string;
}

export function objects(graph: N3.Store, subject: string | N3.Term, predicate: string): N3.Term[] {
  const s = typeof subject === "string" ? N3.DataFactory.namedNode(subject) : subject;
  return graph.getObjects(s, N3.DataFactory.namedNode(predicate), null);
}

export function value(graph: N3.Store, subject: string | N3.Term, predicate: string): string | undefined {
  return objects(graph, subject, predicate)[0]?.value;
}

export function values(graph: N3.Store, subject: string | N3.Term, predicate: string): string[] {
  return objects(graph, subject, predicate).map((t) => t.value);
}

/** The members of an RDF list, in order. */
export function list(graph: N3.Store, head: N3.Term | undefined): N3.Term[] {
  const out: N3.Term[] = [];
  let node = head;
  while (node && node.value !== RDF + "nil") {
    const first = objects(graph, node, RDF + "first")[0];
    if (first) out.push(first);
    node = objects(graph, node, RDF + "rest")[0];
  }
  return out;
}

export async function loadAdapter(resolver: Resolver): Promise<Adapter> {
  const crate = resolver.root + "ro-crate-metadata.json";
  const doc = JSON.parse(decode(await resolver.read(crate)));
  const nquads = (await (jsonld as any).toRDF(doc, {
    base: crate,
    documentLoader,
    format: "application/n-quads",
  })) as string;
  const graph = new N3.Store(new N3.Parser({ format: "N-Quads" }).parse(nquads));

  const root = value(graph, crate, SCHEMA + "about");
  if (!root) throw new Error("the crate's metadata descriptor names no root entity (about)");
  if (!values(graph, root, RDF_TYPE).includes(BRIDGE + "Adapter")) {
    throw new Error(`the crate's root entity ${root} is not a bridge:Adapter`);
  }

  const manifest = value(graph, root, BRIDGE + "testManifest");
  if (!manifest) throw new Error("the adapter names no bridge:testManifest");
  graph.addQuads(parseTurtle(decode(await resolver.read(manifest)), manifest));

  return {
    root,
    crate,
    graph,
    identifier: value(graph, root, SCHEMA + "identifier"),
    unit: value(graph, root, BRIDGE + "unit"),
    profilesRequired: values(graph, root, BRIDGE + "profileRequired"),
    mappings: values(graph, root, BRIDGE + "mapping"),
    findingsQueries: values(graph, root, BRIDGE + "findingsQuery"),
    detectQuery: value(graph, root, BRIDGE + "detectQuery"),
    tables: values(graph, root, BRIDGE + "table"),
    envelopes: values(graph, root, BRIDGE + "envelope").map((iri) => ({
      iri,
      name: value(graph, iri, SCHEMA + "name"),
      rootElement: value(graph, iri, BRIDGE + "rootElement"),
    })),
    manifest,
  };
}

export const MANIFEST = { entries: MF + "entries", action: MF + "action", result: MF + "result", name: MF + "name" };
