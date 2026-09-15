// Executing a test manifest. Each entry is judged by the rule its type carries,
// as the rdfs:comment on that type in the specification's vocabulary states it.
import * as N3 from "n3";
import { type Adapter, MANIFEST, list, objects, value, values } from "./load.ts";
import { BRIDGE, RDF_TYPE, canonicalLines, decode, parseTurtle } from "./rdf.ts";
import type { Resolver } from "./resolver-types.ts";
import { type Finding, type Prepared, convert, prepare } from "./run.ts";

export const OFFERED_PROFILES = [BRIDGE + "sparql-1.1"];

export type Outcome = "passed" | "failed" | "cantTell" | "untested" | "inapplicable";

export interface EntryResult {
  /**
   * The entry as the manifest lists it. Only an IRI names a test outside the
   * manifest; a blank node or a literal does not.
   */
  entry: N3.Term;
  name: string;
  type: string;
  outcome: Outcome;
  description: string;
  ms: number;
}

export interface RunOptions {
  datasets?: boolean;
}

const TYPES = {
  isomorphic: BRIDGE + "IsomorphicConversionTest",
  inputOnly: BRIDGE + "InputOnlyTest",
  dataset: BRIDGE + "DatasetCompletionTest",
};

function key(f: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(f).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));
}

/** The difference between two multisets, each entry counted. */
export function multisetDiff(produced: object[], expected: object[]): { missing: string[]; extra: string[] } {
  const count = (xs: object[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(key(x as Record<string, unknown>), (m.get(key(x as Record<string, unknown>)) ?? 0) + 1);
    return m;
  };
  const p = count(produced);
  const e = count(expected);
  const missing: string[] = [];
  const extra: string[] = [];
  for (const [k, n] of e) for (let i = p.get(k) ?? 0; i < n; i++) missing.push(k);
  for (const [k, n] of p) for (let i = e.get(k) ?? 0; i < n; i++) extra.push(k);
  return { missing, extra };
}

function sample(lines: string[], n = 3): string {
  return lines.slice(0, n).map((l) => (l.length > 160 ? l.slice(0, 160) + "…" : l)).join("; ");
}

function without(quads: N3.Quad[], ignore: Set<string>): N3.Quad[] {
  return quads.filter((q) => !ignore.has(q.predicate.value));
}

export async function runManifest(adapter: Adapter, resolver: Resolver, options: RunOptions = {}): Promise<EntryResult[]> {
  const g = adapter.graph;
  const entries = list(g, objects(g, adapter.manifest, MANIFEST.entries)[0]);
  const manifestIgnore = values(g, adapter.manifest, BRIDGE + "ignorePredicate");

  const unoffered = adapter.profilesRequired.filter((p) => !OFFERED_PROFILES.includes(p));
  let setup: Prepared | Error | undefined;
  if (!unoffered.length) {
    try {
      setup = await prepare(adapter, resolver);
    } catch (e) {
      setup = e as Error;
    }
  }

  const results: EntryResult[] = [];
  for (const entry of entries) {
    const start = performance.now();
    const types = values(g, entry, RDF_TYPE);
    const type = Object.values(TYPES).find((t) => types.includes(t)) ?? types[0] ?? "";
    const name = value(g, entry, MANIFEST.name) ?? entry.value;
    const done = (outcome: Outcome, description: string) =>
      results.push({ entry, name, type, outcome, description, ms: performance.now() - start });

    if (!setup) {
      done("inapplicable", `the adapter requires ${unoffered.join(", ")}, which this Bridge does not offer`);
      continue;
    }
    if (setup instanceof Error) {
      done("failed", `the adapter could not be prepared: ${setup.message}`);
      continue;
    }
    const action = objects(g, entry, MANIFEST.action)[0];
    try {
      if (type === TYPES.dataset) {
        done("untested", options.datasets
          ? "--datasets was given, but streaming a referenced dataset is not implemented in this Bridge yet"
          : "datasets are not fetched; pass --datasets to run them");
        continue;
      }
      if (type !== TYPES.isomorphic && type !== TYPES.inputOnly) {
        done("inapplicable", `entry type ${type || "(none)"} is not one this Bridge knows`);
        continue;
      }
      const input = action && value(g, action, BRIDGE + "input");
      if (!input) throw new Error("the entry's action names no bridge:input");
      const run = convert(setup, decode(await resolver.read(input)));
      const detect = run.detected === false ? "; the detect query is false for this input (reported, not judged)" : "";

      if (type === TYPES.inputOnly) {
        done("cantTell", `input-only: ${run.units} unit(s), ${run.quads.length} triples and ${run.findings.length} findings recorded, not judged (bridge:InputOnlyTest)${detect}`);
        continue;
      }

      const result = objects(g, entry, MANIFEST.result)[0];
      const graphIri = result && value(g, result, BRIDGE + "graph");
      if (!graphIri) throw new Error("the entry's result names no bridge:graph");
      const own = values(g, entry, BRIDGE + "ignorePredicate");
      const ignore = new Set(own.length ? own : manifestIgnore);

      const expected = await canonicalLines(without(parseTurtle(decode(await resolver.read(graphIri)), graphIri), ignore));
      const produced = await canonicalLines(without(run.quads, ignore));
      const expectedSet = new Set(expected);
      const producedSet = new Set(produced);
      const graphMissing = expected.filter((l) => !producedSet.has(l));
      const graphExtra = produced.filter((l) => !expectedSet.has(l));
      const graphOk = graphMissing.length === 0 && graphExtra.length === 0;

      const findingsIri = value(g, result, BRIDGE + "findings");
      let findingsOk = true;
      let findingsText = "findings not compared: the entry names no bridge:findings";
      if (findingsIri) {
        const want = JSON.parse(decode(await resolver.read(findingsIri))) as Finding[];
        const d = multisetDiff(run.findings, want);
        findingsOk = d.missing.length === 0 && d.extra.length === 0;
        findingsText = findingsOk
          ? `findings equal as a multiset (${want.length})`
          : `findings differ: ${d.missing.length} missing, ${d.extra.length} extra (missing: ${sample(d.missing, 2)}; extra: ${sample(d.extra, 2)})`;
      }
      const graphText = graphOk
        ? `graph isomorphic (${expected.length} triples)`
        : `graph differs: ${graphMissing.length} missing, ${graphExtra.length} extra (missing: ${sample(graphMissing, 2)}; extra: ${sample(graphExtra, 2)})`;
      done(graphOk && findingsOk ? "passed" : "failed", `${graphText}; ${findingsText}${detect}`);
    } catch (e) {
      done("failed", `error: ${(e as Error).message}`);
    }
  }
  return results;
}
