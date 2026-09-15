#!/usr/bin/env node
// cascade-bridge test <adapter-dir> [--earl <out.ttl>] [--datasets]
import { writeFile } from "node:fs/promises";
import { earlReport, loadAdapter, OFFERED_PROFILES, runManifest, type Outcome } from "@the-cascade-protocol/bridge";
import { directoryResolver } from "@the-cascade-protocol/bridge/node";

const SUBJECT = { iri: "https://github.com/jayostis/cascade-bridge-js", name: "Cascade Bridge for JavaScript", version: "0.0.0" };
// A run proves nothing when an entry failed or could not be run at all.
const FAILING: Outcome[] = ["failed", "inapplicable"];

function usage(): never {
  console.error("usage: cascade-bridge test <adapter-dir> [--earl <out.ttl>] [--datasets]");
  process.exit(2);
}

async function main(argv: string[]): Promise<number> {
  const [command, dir, ...rest] = argv;
  if (command !== "test" || !dir) usage();
  let earl: string | undefined;
  let datasets = false;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--earl" && rest[i + 1]) earl = rest[++i];
    else if (rest[i] === "--datasets") datasets = true;
    else usage();
  }

  const resolver = directoryResolver(dir);
  const adapter = await loadAdapter(resolver);
  console.log(`Adapter  ${adapter.identifier ?? adapter.root}  (${adapter.root})`);
  console.log(`Bridge   ${SUBJECT.name} ${SUBJECT.version}, offers ${OFFERED_PROFILES.map((p) => p.split("#")[1]).join(", ")}`);
  console.log("");

  const results = await runManifest(adapter, resolver, { datasets });
  const width = Math.max(...results.map((r) => r.name.length), 4);
  for (const r of results) {
    console.log(`  ${r.outcome.padEnd(12)} ${r.name.padEnd(width)}  ${(r.ms / 1000).toFixed(2).padStart(6)} s  ${r.description}`);
  }
  const tally = new Map<Outcome, number>();
  for (const r of results) tally.set(r.outcome, (tally.get(r.outcome) ?? 0) + 1);
  console.log("");
  console.log([...tally].map(([o, n]) => `${n} ${o}`).join(", "));

  if (earl) {
    await writeFile(earl, await earlReport(results, SUBJECT));
    console.log(`EARL     ${earl}`);
  }
  return results.some((r) => FAILING.includes(r.outcome)) ? 1 : 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    console.error(`cascade-bridge: ${(e as Error).message}`);
    process.exit(2);
  },
);
