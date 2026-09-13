# cascade-bridge-js

**Cascade Bridge for JavaScript**: an implementation of the
[Cascade Bridge Specification](https://github.com/jayostis/cascade-bridge-spec).
It runs a Cascade Bridge Adapter, a data package for one source format, and
executes the adapter's test manifest.

## Status: DRAFT

It implements the `sparql-1.1` profile as the specification is being changed to
define it: a mapping is SPARQL 1.1 CONSTRUCT over a generic lift of the source
XML. That profile is not in a tagged specification release yet, so this
repository pins none. No compatibility is promised.

Built: loading an adapter, the lift, running the mappings and findings queries
per unit, the detect query, and the test harness with EARL output. Not built
yet: the stamp stage, source-schema validation, a `convert` command, and
streaming a referenced dataset.

Known limitation: Oxigraph 0.5.11 returns derived XSD integer types such as
`xsd:positiveInteger` as `xsd:integer`, which SPARQL 1.1 does not allow, so an
expected graph that uses them cannot pass on this Bridge.

## Running an adapter's tests

```bash
npm install
node packages/bridge-cli/src/cli.ts test <adapter-dir> [--earl report.ttl] [--datasets]
```

Node 24 runs the TypeScript directly; there is no build step.
`npm run cascade-bridge -- test <adapter-dir>` is the same command.

It prints one line per manifest entry and, with `--earl`, writes one
`earl:Assertion` per entry. The exit status is 0 when no entry failed and none
was inapplicable, 1 otherwise, and 2 on a usage error or an adapter that
cannot be loaded.

| outcome | when |
|---|---|
| `passed` | the rule the entry's type carries held |
| `failed` | it did not, or the entry could not be run |
| `cantTell` | an input-only entry: the output is recorded, never judged |
| `untested` | a dataset entry: datasets are not fetched |
| `inapplicable` | the adapter requires a profile this Bridge does not offer |

## What it does with an adapter

1. Loads `ro-crate-metadata.json` (JSON-LD) and the crate's test manifest
   (Turtle) as one graph, each with its own location as base. The RO-Crate
   context is bundled; nothing is fetched.
2. Per document, lifts the XML in one pass. Each `bridge:unit` element becomes
   its own graph with the unit as root, and the rest becomes the skeleton the
   `bridge:detectQuery` ASK reads.
3. Per unit, in a store of its own: loads the lifted unit and any Turtle
   `bridge:table`, unions every `bridge:mapping` CONSTRUCT, and concatenates
   every `bridge:findingsQuery` SELECT row into a finding.
4. Judges each manifest entry by its type's rule: graphs compared as
   RDFC-1.0 canonical form after the ignored predicates are removed from both
   sides, findings compared as a multiset.

## Layout

```
packages/bridge/              the library, @the-cascade-protocol/bridge
  src/lift.ts                 XML to Facade-X-shaped N-Triples: units and skeleton
  src/load.ts                 the crate and the manifest as one graph
  src/run.ts                  mappings and findings queries, per unit
  src/harness.ts              executing a test manifest
  src/earl.ts                 the EARL report
  src/resolver.ts             the only module that touches a filesystem
  src/contexts/               bundled JSON-LD contexts
  test/tiny-adapter/          the engine's own synthetic adapter
packages/bridge-cli/          the cascade-bridge command
```

## Dependencies

Exact versions, all open source: `oxigraph` 0.5.11 (MIT OR Apache-2.0),
`saxes` 6.0.0 (ISC), `n3` 2.7.12 (MIT), `rdf-canonize` 5.0.0 (BSD-3-Clause),
`jsonld` 9.0.0 (BSD-3-Clause). The bundled RO-Crate 1.2 context is CC0.

## Licence

Apache-2.0.
