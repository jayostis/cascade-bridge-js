// The report: one earl:Assertion per manifest entry, the form every W3C test
// suite's implementation reports take.
import * as N3 from "n3";
import type { EntryResult } from "./harness.ts";

const EARL = "http://www.w3.org/ns/earl#";
const DCT = "http://purl.org/dc/terms/";
const DOAP = "http://usefulinc.com/ns/doap#";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

export interface ReportSubject {
  iri: string;
  name: string;
  version: string;
}

export function earlReport(results: EntryResult[], subject: ReportSubject, date = new Date()): Promise<string> {
  const { namedNode: n, literal: l } = N3.DataFactory;
  const w = new N3.Writer({ prefixes: { earl: EARL, dct: DCT, doap: DOAP, xsd: XSD } });
  const s = n(subject.iri);
  w.addQuad(s, n(RDF_TYPE), n(EARL + "Software"));
  w.addQuad(s, n(RDF_TYPE), n(DOAP + "Project"));
  w.addQuad(s, n(DOAP + "name"), l(subject.name));
  w.addQuad(s, n(DOAP + "release"), w.blank(n(DOAP + "revision"), l(subject.version)));
  const when = l(date.toISOString(), n(XSD + "dateTime"));
  for (const r of results) {
    // An entry with no IRI has no name outside its manifest, so it is reported
    // as an anonymous test carrying the entry's name: the report still holds
    // one assertion per entry.
    const test = r.entry.termType === "NamedNode"
      ? n(r.entry.value)
      : w.blank(n(DCT + "title"), l(r.name));
    w.addQuad(
      w.blank([
        { predicate: n(RDF_TYPE), object: n(EARL + "Assertion") },
        { predicate: n(EARL + "assertedBy"), object: s },
        { predicate: n(EARL + "subject"), object: s },
        { predicate: n(EARL + "test"), object: test },
        { predicate: n(EARL + "mode"), object: n(EARL + "automatic") },
        {
          predicate: n(EARL + "result"),
          object: w.blank([
            { predicate: n(RDF_TYPE), object: n(EARL + "TestResult") },
            { predicate: n(EARL + "outcome"), object: n(EARL + r.outcome) },
            { predicate: n(DCT + "description"), object: l(r.description) },
            { predicate: n(DCT + "date"), object: when },
          ]),
        },
      ]),
      n(RDF_TYPE),
      n(EARL + "Assertion"),
    );
  }
  return new Promise((resolve, reject) => w.end((err, out) => (err ? reject(err) : resolve(out))));
}
