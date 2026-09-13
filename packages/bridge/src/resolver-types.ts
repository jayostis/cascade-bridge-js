/**
 * Where an adapter's files come from. The library asks for bytes by IRI and
 * never touches a filesystem itself, so the same code runs wherever a host can
 * supply bytes: a directory here, a fetch in a browser.
 */
export interface Resolver {
  /** The adapter's root, the IRI the crate's root entity resolves to, ending in "/". */
  readonly root: string;
  read(iri: string): Promise<Uint8Array>;
}
