import { join } from "node:path";
import * as N3 from "n3";
import { describe, expect, it } from "vitest";
import { earlReport, loadAdapter, runManifest } from "../src/index.ts";
import { directoryResolver } from "../src/resolver.ts";

const TINY = join(import.meta.dirname, "tiny-adapter");
const EARL = "http://www.w3.org/ns/earl#";

async function run() {
  const resolver = directoryResolver(TINY);
  const adapter = await loadAdapter(resolver);
  return { adapter, resolver, results: await runManifest(adapter, resolver) };
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

  it("reports one EARL assertion per entry, its outcome on the TestResult", async () => {
    const { results } = await run();
    const ttl = await earlReport(results, { iri: "urn:example:bridge", name: "test", version: "0" });
    const g = new N3.Store(new N3.Parser().parse(ttl));
    const assertions = g.getSubjects("http://www.w3.org/1999/02/22-rdf-syntax-ns#type", EARL + "Assertion", null);
    expect(assertions).toHaveLength(results.length);
    for (const a of assertions) {
      const result = g.getObjects(a, EARL + "result", null)[0]!;
      expect(g.getObjects(result, EARL + "outcome", null)).toHaveLength(1);
      expect(g.getObjects(a, EARL + "outcome", null)).toHaveLength(0);
    }
  });
});
