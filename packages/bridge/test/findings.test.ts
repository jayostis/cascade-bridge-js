// A finding member is the lexical form of the term its variable is bound to:
// an IRI's own characters, or a literal's lexical form without its datatype or
// language tag. An unbound variable or a blank node has no such string and is
// an error in the query (the specification's engine/sparql.md, step 4). The
// tiny adapter's findings query is rewritten so ?sourceField is bound each way.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { convert, loadAdapter, prepare, type Resolver } from "../src/index.ts";
import { directoryResolver } from "../src/resolver.ts";

const TINY = join(import.meta.dirname, "tiny-adapter");
const LINE = 'BIND("item/title" AS ?sourceField)';

/** The tiny adapter with the line binding ?sourceField in its findings query replaced. */
function withSourceField(binding: string): Resolver {
  const directory = directoryResolver(TINY);
  return {
    root: directory.root,
    async read(iri) {
      const bytes = await directory.read(iri);
      if (!iri.endsWith("mapping/item-findings.rq")) return bytes;
      const text = new TextDecoder().decode(bytes);
      if (!text.includes(LINE)) throw new Error(`the findings query binds ${LINE}`);
      return new TextEncoder().encode(text.replace(LINE, () => binding));
    },
  };
}

/** Each finding's sourceField, from the two-item input, where one item has no title and so draws one finding. */
async function sourceFields(binding: string): Promise<string[]> {
  const resolver = withSourceField(binding);
  const prepared = await prepare(await loadAdapter(resolver), resolver);
  const xml = new TextDecoder().decode(await resolver.read(`${resolver.root}fixtures/in/two.xml`));
  return convert(prepared, xml).findings.map((f) => f.sourceField);
}

describe("a finding member", () => {
  it("is an IRI's own characters when its variable is bound to an IRI", async () => {
    expect(await sourceFields("BIND(xyz:title AS ?sourceField)")).toEqual([
      "http://sparql.xyz/facade-x/data/title",
    ]);
  });

  it("is a literal's lexical form, without its language tag", async () => {
    expect(await sourceFields('BIND("item/title"@en AS ?sourceField)')).toEqual(["item/title"]);
  });

  it("is refused when its variable is bound to a blank node", async () => {
    await expect(sourceFields("BIND(BNODE() AS ?sourceField)")).rejects.toThrow(/\?sourceField/);
  });

  it("is refused when its variable is left unbound", async () => {
    await expect(sourceFields("")).rejects.toThrow(/\?sourceField/);
  });
});
