import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as N3 from "n3";
import { describe, expect, it } from "vitest";
import { type EntryResult, earlReport, loadAdapter, runManifest } from "../src/index.ts";
import { directoryResolver } from "../src/resolver.ts";
import { TINY, withEntries } from "./entries.ts";

const EARL = "http://www.w3.org/ns/earl#";
const DCT = "http://purl.org/dc/terms/";

async function run() {
  const resolver = directoryResolver(TINY);
  const adapter = await loadAdapter(resolver);
  return { adapter, resolver, results: await runManifest(adapter, resolver) };
}

async function report(results: EntryResult[]): Promise<N3.Store> {
  const ttl = await earlReport(results, { iri: "urn:example:bridge", name: "test", version: "0" });
  return new N3.Store(new N3.Parser().parse(ttl));
}

/** What each assertion's earl:test names: its IRI, or the title of a test that has none. */
function testsReported(g: N3.Store): string[] {
  return g
    .getObjects(null, EARL + "test", null)
    .map((t) =>
      t.termType === "NamedNode"
        ? t.value
        : `anonymous: ${g.getObjects(t, DCT + "title", null).map((x) => x.value).join()}`,
    )
    .sort();
}

describe("executing a test manifest", () => {
  it("reaches every outcome, and fails exactly the entries built to fail", async () => {
    const { results } = await run();
    expect(Object.fromEntries(results.map((r) => [r.name, r.outcome]))).toEqual({
      pass: "passed",
      "graph-fail": "failed",
      "findings-fail": "failed",
      "multiset-order": "passed",
      "input-only": "cantTell",
      dataset: "untested",
    });
  });

  it("says what differed, in the words of the comparison", async () => {
    const { results } = await run();
    const byName = new Map(results.map((r) => [r.name, r.description]));
    expect(byName.get("graph-fail")).toMatch(/graph differs: 1 missing, 1 extra/);
    expect(byName.get("findings-fail")).toMatch(/findings differ: 0 missing, 1 extra/);
    expect(byName.get("pass")).not.toMatch(/detect query is false/);
  });

  it("runs nothing when the adapter requires a profile this Bridge does not offer", async () => {
    const resolver = directoryResolver(TINY);
    const adapter = await loadAdapter(resolver);
    adapter.profilesRequired.push("https://ns.cascadeprotocol.org/bridge/v1-draft#xslt-3");
    const results = await runManifest(adapter, resolver);
    expect(new Set(results.map((r) => r.outcome))).toEqual(new Set(["inapplicable"]));
  });

  it("fails every entry, naming the term, when the adapter names no unit", async () => {
    const resolver = directoryResolver(TINY);
    const adapter = await loadAdapter(resolver);
    adapter.unit = undefined;
    const results = await runManifest(adapter, resolver);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.outcome, r.name).toBe("failed");
      expect(r.description, r.name).toContain("the adapter names no bridge:unit");
    }
  });

  it("refuses an entry list that loops back on itself", { timeout: 30_000 }, () => {
    // Walked without a guard this list never ends, and a loop that never yields
    // cannot be interrupted from inside, so the run is watched from another
    // process: a hang would otherwise be this test's only way to fail.
    const url = (p: string) => JSON.stringify(pathToFileURL(join(import.meta.dirname, p)).href);
    const script = [
      `import { loadAdapter, runManifest } from ${url("../src/index.ts")};`,
      `import { withEntries } from ${url("entries.ts")};`,
      `const resolver = withEntries("_:cell", "_:cell <http://www.w3.org/1999/02/22-rdf-syntax-ns#rest> _:cell .");`,
      `const adapter = await loadAdapter(resolver);`,
      `await runManifest(adapter, resolver).then(`,
      `  (results) => console.log("ran " + results.length + " entries"),`,
      `  (e) => console.log("refused: " + e.message),`,
      `);`,
    ].join("\n");
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
      timeout: 15_000,
    });
    expect(child.signal, "the run to end").toBeNull();
    expect(child.stdout).toMatch(/^refused: .*loops back on itself/);
  });

  it("reports an entry with no IRI as an anonymous earl:test titled with its name", async () => {
    const resolver = withEntries(`( <#pass> "not a test"
      [ a bridge:IsomorphicConversionTest ; mf:name "anonymous" ;
        mf:action [ bridge:input <in/two.xml> ] ;
        mf:result [ bridge:graph <expected/two.ttl> ; bridge:findings <findings/two.json> ] ] )`);
    const adapter = await loadAdapter(resolver);
    const results = await runManifest(adapter, resolver);
    expect(results.map((r) => [r.name, r.outcome])).toEqual([
      ["pass", "passed"],
      ["not a test", "inapplicable"],
      ["anonymous", "passed"],
    ]);
    const reported = testsReported(await report(results));
    expect(reported).toHaveLength(3);
    expect(reported.slice(0, 2)).toEqual(["anonymous: anonymous", "anonymous: not a test"]);
    expect(reported[2]).toMatch(/\/fixtures\/manifest\.ttl#pass$/);
  });

  it("reports one EARL assertion per entry, its outcome on the TestResult", async () => {
    const { results } = await run();
    const g = await report(results);
    const assertions = g.getSubjects("http://www.w3.org/1999/02/22-rdf-syntax-ns#type", EARL + "Assertion", null);
    expect(assertions).toHaveLength(results.length);
    for (const a of assertions) {
      const result = g.getObjects(a, EARL + "result", null)[0]!;
      expect(g.getObjects(result, EARL + "outcome", null)).toHaveLength(1);
      expect(g.getObjects(a, EARL + "outcome", null)).toHaveLength(0);
    }
  });
});
