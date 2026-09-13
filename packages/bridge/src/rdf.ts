// The RDF plumbing every stage shares: namespaces, and the one canonical form
// graphs are compared in.
import * as N3 from "n3";
import canonize from "rdf-canonize";

export const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
export const RDF_TYPE = RDF + "type";
export const SCHEMA = "http://schema.org/";
export const BRIDGE = "https://ns.cascadeprotocol.org/bridge/v1-draft#";
export const MF = "http://www.w3.org/2001/sw/DataAccess/tests/test-manifest#";

const { namedNode, blankNode, literal, defaultGraph, quad } = N3.DataFactory;

type AnyTerm = { termType: string; value: string; language?: string; datatype?: { value: string } };

/** An RDF/JS term from any library (Oxigraph's included) as an N3 term. */
export function toN3Term(t: AnyTerm): N3.Term {
  switch (t.termType) {
    case "NamedNode":
      return namedNode(t.value);
    case "BlankNode":
      return blankNode(t.value);
    case "Literal":
      return literal(t.value, t.language || namedNode(t.datatype!.value));
    case "DefaultGraph":
      return defaultGraph();
    default:
      throw new Error(`unsupported term type ${t.termType}`);
  }
}

export function toN3Quad(q: { subject: AnyTerm; predicate: AnyTerm; object: AnyTerm }): N3.Quad {
  return quad(
    toN3Term(q.subject) as N3.Quad_Subject,
    toN3Term(q.predicate) as N3.Quad_Predicate,
    toN3Term(q.object) as N3.Quad_Object,
  );
}

export function parseTurtle(text: string, baseIRI: string): N3.Quad[] {
  return new N3.Parser({ baseIRI }).parse(text.replace(/^﻿/, ""));
}

export function toNQuads(quads: N3.Quad[]): string {
  return new N3.Writer({ format: "N-Quads" }).quadsToString(quads);
}

/**
 * RDFC-1.0 canonical N-Quads, one line per triple, duplicates removed: two
 * graphs are isomorphic exactly when these are equal.
 */
export async function canonicalLines(quads: N3.Quad[]): Promise<string[]> {
  const nq = toNQuads(quads);
  const out: string = await canonize.canonize(nq, { algorithm: "RDFC-1.0", inputFormat: "application/n-quads" });
  return [...new Set(out.split("\n").filter(Boolean))];
}

export function decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
}
