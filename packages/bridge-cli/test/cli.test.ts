import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CLI = join(import.meta.dirname, "..", "src", "cli.ts");
const TINY = join(import.meta.dirname, "..", "..", "bridge", "test", "tiny-adapter");

describe("cascade-bridge test", () => {
  it("prints a line per entry and exits non-zero when an entry fails", () => {
    const run = spawnSync(process.execPath, [CLI, "test", TINY], { encoding: "utf8" });
    expect(run.status).toBe(1);
    expect(run.stdout).toMatch(/passed\s+pass\b/);
    expect(run.stdout).toMatch(/failed\s+graph-fail\b/);
    expect(run.stdout).toMatch(/2 passed, 2 failed, 1 cantTell, 1 untested/);
  });

  it("refuses an unknown command with a usage line", () => {
    const run = spawnSync(process.execPath, [CLI, "convert"], { encoding: "utf8" });
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/usage: cascade-bridge test/);
  });
});
