// Running an adapter on one document, per unit: lift the unit, load the tables
// beside it, run every mapping and union the graphs, then run every findings
// query and concatenate the rows. Each unit gets a store of its own, so no
// query can see another unit.
import oxigraph from "oxigraph";
import type * as N3 from "n3";
import { liftDocument } from "./lift.ts";
import { type Adapter, value } from "./load.ts";
import { SCHEMA, decode, toN3Quad } from "./rdf.ts";
import type { Resolver } from "./resolver-types.ts";

export interface Finding {
  sourceField: string;
  reason: string;
  severity: string;
  context: string;
}

const FINDING_KEYS = ["sourceField", "reason", "severity", "context"] as const;

export interface Prepared {
  unit?: string;
  mappings: { iri: string; text: string }[];
  findingsQueries: { iri: string; text: string }[];
  detect?: { iri: string; text: string };
  tables: { iri: string; text: string }[];
}

export interface Conversion {
  quads: N3.Quad[];
  findings: Finding[];
  units: number;
  /** The detect query's answer over the skeleton, when the adapter has one. */
  detected?: boolean;
  ms: { lift: number; detect: number; mappings: number; findings: number };
}

async function text(resolver: Resolver, iri: string) {
  return { iri, text: decode(await resolver.read(iri)) };
}

/** Read everything an adapter runs, once, before any document. */
export async function prepare(adapter: Adapter, resolver: Resolver): Promise<Prepared> {
  if (adapter.mappings.length === 0) throw new Error("the adapter names no bridge:mapping");
  for (const t of adapter.tables) {
    const format = value(adapter.graph, t, SCHEMA + "encodingFormat");
    if (format !== "text/turtle") throw new Error(`table ${t} is ${format ?? "undeclared"}; this Bridge loads text/turtle tables`);
  }
  return {
    unit: adapter.unit,
    mappings: await Promise.all(adapter.mappings.map((m) => text(resolver, m))),
    findingsQueries: await Promise.all(adapter.findingsQueries.map((f) => text(resolver, f))),
    detect: adapter.detectQuery ? await text(resolver, adapter.detectQuery) : undefined,
    tables: await Promise.all(adapter.tables.map((t) => text(resolver, t))),
  };
}

function toFinding(row: Map<string, { termType: string; value: string }>, query: string): Finding {
  const f = {} as Finding;
  for (const key of FINDING_KEYS) {
    const term = row.get(key);
    if (!term || (term.termType !== "Literal" && term.termType !== "NamedNode"))
      throw new Error(`findings query ${query} left ?${key} unbound or bound to a term with no lexical form, such as a blank node`);
    f[key] = term.value;
  }
  return f;
}

export function convert(prepared: Prepared, xml: string): Conversion {
  const ms = { lift: 0, detect: 0, mappings: 0, findings: 0 };
  let t = performance.now();
  const lifted = liftDocument(xml, prepared.unit);
  ms.lift = performance.now() - t;

  let detected: boolean | undefined;
  if (prepared.detect) {
    t = performance.now();
    const store = new oxigraph.Store();
    store.load(lifted.skeleton, { format: "application/n-triples" });
    const answer = store.query(prepared.detect.text);
    if (typeof answer !== "boolean") throw new Error(`detect query ${prepared.detect.iri} is not an ASK`);
    detected = answer;
    ms.detect = performance.now() - t;
  }

  const quads: N3.Quad[] = [];
  const findings: Finding[] = [];
  for (const unit of lifted.units) {
    const store = new oxigraph.Store();
    store.load(unit, { format: "application/n-triples" });
    for (const table of prepared.tables) store.load(table.text, { format: "text/turtle", base_iri: table.iri });

    t = performance.now();
    for (const m of prepared.mappings) {
      const result = store.query(m.text);
      if (!Array.isArray(result) || (result.length > 0 && result[0] instanceof Map)) {
        throw new Error(`mapping ${m.iri} is not a CONSTRUCT`);
      }
      for (const q of result as any[]) quads.push(toN3Quad(q));
    }
    ms.mappings += performance.now() - t;

    t = performance.now();
    for (const f of prepared.findingsQueries) {
      const rows = store.query(f.text);
      if (!Array.isArray(rows) || (rows.length > 0 && !(rows[0] instanceof Map))) {
        throw new Error(`findings query ${f.iri} is not a SELECT`);
      }
      for (const row of rows as Map<string, { termType: string; value: string }>[]) findings.push(toFinding(row, f.iri));
    }
    ms.findings += performance.now() - t;
  }
  return { quads, findings, units: lifted.units.length, detected, ms };
}
