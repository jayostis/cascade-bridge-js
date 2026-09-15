# cascade-bridge-js — Agent Context

The Cascade Bridge for JavaScript: it runs Cascade Bridge Adapters. The
contract is the Cascade Bridge Specification, `jayostis/cascade-bridge-spec`,
and this repository is one implementation of it, never a second statement of
it.

## The rules

- **The specification is the authority.** A test type's rule is the
  `rdfs:comment` on that type in the specification's `vocab/bridge.ttl`.
  Implement that, not a paraphrase. Where the specification is silent or
  wrong, the fix is a pull request there, not a behaviour invented here.
- **This repository knows no adapter.** Its test subject is
  `packages/bridge/test/tiny-adapter`, synthetic, built so each outcome is
  reached by the smallest input that can reach it. Running a real adapter
  produces an EARL report about that pair; it is never a test here. An engine
  tested against the adapters it has met passes those adapters, not the
  contract.
- **The library never touches a filesystem.** Only `src/resolver.ts` imports a
  Node built-in, and `test/boundary.test.ts` holds it to that. A host that is
  not Node, such as a browser, supplies bytes by IRI instead, and a stray `fs`
  import would be found by the first one that tried.
- **Nothing is fetched.** JSON-LD contexts are bundled in `src/contexts/`. A
  crate naming another context fails to load instead of reaching the network.
- **Each unit gets a store of its own.** A mapping sees one unit, lifted with
  the unit as root, so no query can reach into another record.
- **Every dependency is pinned exactly.** A range lets the engine change under
  a green run.

## Conventions

- Node 24 runs the TypeScript directly: erasable syntax only (no enums,
  namespaces or parameter properties), and relative imports name the `.ts`
  file. `npm run typecheck` checks, `npm test` runs vitest.
- Conventional commits. Impersonal. No archaeology: what a file used to be is
  git's job.
- Why, never what. A comment restating the line below it goes.
