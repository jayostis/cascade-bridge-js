// The Node resolver: the one module in this package allowed to touch the
// filesystem (test/boundary.test.ts holds it to that).
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Resolver } from "./resolver-types.ts";

/** Resolve an adapter from a directory. Nothing outside it is readable. */
export function directoryResolver(dir: string): Resolver {
  const root = pathToFileURL(resolve(dir) + sep).href;
  return {
    root,
    async read(iri: string): Promise<Uint8Array> {
      const bare = iri.split("#")[0]!;
      if (!bare.startsWith(root)) throw new Error(`not inside the adapter: ${iri}`);
      return new Uint8Array(await readFile(fileURLToPath(bare)));
    },
  };
}
