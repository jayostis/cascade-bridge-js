// The library must run wherever a host can hand it bytes. A Node built-in
// imported anywhere but the resolver would make that false for every host that
// is not Node, and would only be found by the first one that tried.
import { readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..", "src");
const ALLOWED = new Set(["resolver.ts"]);
const BUILTINS = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));

describe("the Node boundary", () => {
  it("lets only the resolver import a Node built-in", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(SRC).filter((f) => f.endsWith(".ts") && !ALLOWED.has(f))) {
      const text = readFileSync(join(SRC, file), "utf8");
      for (const m of text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
        if (BUILTINS.has(m[1]!) || m[1]!.startsWith("node:")) offenders.push(`${file}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
