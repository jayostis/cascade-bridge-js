// The specification's lift vectors, judged by the bridge:LiftTest rule. They
// live in jayostis/cascade-bridge-spec, not here, so they run only where
// CASCADE_BRIDGE_SPEC names a checkout of it: CI checks one out at a tag.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as N3 from "n3";
import { expect, it } from "vitest";
import { liftDocument } from "../src/lift.ts";
import { MANIFEST, list, objects, value, values } from "../src/load.ts";
import { BRIDGE, RDF_TYPE, canonicalLines, parseTurtle } from "../src/rdf.ts";

const SPEC = process.env.CASCADE_BRIDGE_SPEC;

function read(iri: string): string {
  return readFileSync(fileURLToPath(iri), "utf8");
}

it.skipIf(!SPEC)("reproduces every lift vector in the specification", async () => {
  const manifest = pathToFileURL(resolve(SPEC!, "fixtures", "lift", "manifest.ttl")).href;
  const g = new N3.Store(parseTurtle(read(manifest), manifest));
  const entries = list(g, objects(g, manifest, MANIFEST.entries)[0]);
  expect(entries.length).toBeGreaterThan(0);

  const failures: string[] = [];
  for (const entry of entries) {
    const name = value(g, entry, MANIFEST.name) ?? entry.value;
    if (!values(g, entry, RDF_TYPE).includes(BRIDGE + "LiftTest")) {
      failures.push(`${name}: not a bridge:LiftTest`);
      continue;
    }
    const action = objects(g, entry, MANIFEST.action)[0];
    const result = objects(g, entry, MANIFEST.result)[0];
    const input = action && value(g, action, BRIDGE + "input");
    const graph = result && value(g, result, BRIDGE + "graph");
    if (!input || !graph) {
      failures.push(`${name}: names no bridge:input or no bridge:graph`);
      continue;
    }
    const produced = await canonicalLines(parseTurtle(liftDocument(read(input)).skeleton, input));
    const expected = await canonicalLines(parseTurtle(read(graph), graph));
    const missing = expected.filter((l) => !produced.includes(l));
    const extra = produced.filter((l) => !expected.includes(l));
    if (missing.length || extra.length) failures.push(`${name}: missing ${JSON.stringify(missing)}, extra ${JSON.stringify(extra)}`);
  }
  expect(failures).toEqual([]);
});
