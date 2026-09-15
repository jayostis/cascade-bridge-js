// The tiny adapter with its manifest's entry list replaced, so an entry, or the
// list itself, can be written in a form the adapter on disk does not use.
import { join } from "node:path";
import type { Resolver } from "../src/resolver-types.ts";
import { directoryResolver } from "../src/resolver.ts";

export const TINY = join(import.meta.dirname, "tiny-adapter");

/**
 * `list` is what `mf:entries` names in place of the list on disk; `appended`
 * is Turtle added to the manifest, for a list the collection syntax cannot
 * write.
 */
export function withEntries(list: string, appended = ""): Resolver {
  const directory = directoryResolver(TINY);
  return {
    root: directory.root,
    async read(iri) {
      const bytes = await directory.read(iri);
      if (!iri.endsWith("fixtures/manifest.ttl")) return bytes;
      const text = new TextDecoder().decode(bytes);
      const at = text.indexOf("mf:entries (");
      if (at < 0) throw new Error("the tiny adapter's manifest has no entry list");
      const tail = text.slice(text.indexOf(")", at) + 1);
      return new TextEncoder().encode(`${text.slice(0, at)}mf:entries ${list}${tail}\n${appended}\n`);
    },
  };
}
