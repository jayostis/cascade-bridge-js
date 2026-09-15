import * as N3 from "n3";
import { describe, expect, it } from "vitest";
import { FX, XYZ, liftDocument } from "../src/lift.ts";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

function graph(nt: string): N3.Store {
  return new N3.Store(new N3.Parser({ format: "N-Triples" }).parse(nt));
}

function rootOf(g: N3.Store): N3.Term {
  const roots = g.getSubjects(RDF + "type", FX + "root", null);
  expect(roots).toHaveLength(1);
  return roots[0]!;
}

function slot(g: N3.Store, node: N3.Term, n: number): N3.Term | undefined {
  return g.getObjects(node, RDF + "_" + n, null)[0];
}

describe("the lift", () => {
  it("types each element, keeps attributes as plain literals, and orders children by rdf:_N", () => {
    const g = graph(liftDocument(`<a x="1"><b/>t<c y="2"/></a>`).skeleton);
    const root = rootOf(g);
    expect(g.has(N3.DataFactory.quad(root as N3.Quad_Subject, N3.DataFactory.namedNode(RDF + "type"), N3.DataFactory.namedNode(XYZ + "a")))).toBe(true);
    expect(g.getObjects(root, XYZ + "x", null)[0]).toEqual(N3.DataFactory.literal("1"));
    expect(g.getObjects(slot(g, root, 1)!, RDF + "type", null)[0]!.value).toBe(XYZ + "b");
    expect(slot(g, root, 2)).toEqual(N3.DataFactory.literal("t"));
    expect(g.getObjects(slot(g, root, 3)!, XYZ + "y", null)[0]!.value).toBe("2");
  });

  it("drops whitespace-only text, comments, processing instructions, the doctype and the declaration", () => {
    const xml = `<?xml version="1.0"?>\n<!DOCTYPE a>\n<a>\n  <!-- c --><?pi x?>\n  <b/>\n</a>`;
    const g = graph(liftDocument(xml).skeleton);
    const root = rootOf(g);
    expect(slot(g, root, 1)!.termType).toBe("BlankNode");
    expect(slot(g, root, 2)).toBeUndefined();
  });

  it("drops only XML whitespace: a no-break space is a text child, alone or beside spaces", () => {
    const g = graph(liftDocument("<d><a> </a><b>   </b><c>\n</c></d>").skeleton);
    const root = rootOf(g);
    expect(slot(g, slot(g, root, 1)!, 1)).toEqual(N3.DataFactory.literal(" "));
    expect(slot(g, slot(g, root, 2)!, 1)).toEqual(N3.DataFactory.literal("   "));
    expect(slot(g, slot(g, root, 3)!, 1)).toBeUndefined();
  });

  it("keeps other text verbatim, and merges CDATA with adjacent text", () => {
    const g = graph(liftDocument(`<a> x <![CDATA[<y>]]>z</a>`).skeleton);
    expect(slot(g, rootOf(g), 1)).toEqual(N3.DataFactory.literal(" x <y>z"));
  });

  it("names a namespaced element and attribute by their namespace IRI", () => {
    const g = graph(liftDocument(`<p:a xmlns:p="urn:ns#" p:k="v"/>`).skeleton);
    const root = rootOf(g);
    expect(g.getObjects(root, RDF + "type", null).map((t) => t.value)).toContain("urn:ns#a");
    expect(g.getObjects(root, "urn:ns#k", null)[0]!.value).toBe("v");
  });

  it("lifts each unit with the unit element as root, and leaves only an empty container in the skeleton", () => {
    const lifted = liftDocument(`<set n="2"><item id="1"><t>x</t></item><item id="2"/></set>`, "item");
    expect(lifted.units).toHaveLength(2);

    const unit = graph(lifted.units[0]!);
    const root = rootOf(unit);
    expect(unit.getObjects(root, RDF + "type", null).map((t) => t.value)).toContain(XYZ + "item");
    expect(unit.getObjects(root, XYZ + "id", null)[0]!.value).toBe("1");
    expect(unit.getSubjects(RDF + "type", XYZ + "set", null)).toHaveLength(0);

    const skeleton = graph(lifted.skeleton);
    const top = rootOf(skeleton);
    expect(skeleton.getObjects(top, XYZ + "n", null)[0]!.value).toBe("2");
    const first = slot(skeleton, top, 1)!;
    expect(skeleton.getObjects(first, RDF + "type", null)[0]!.value).toBe(XYZ + "item");
    expect(skeleton.getQuads(first, null, null, null)).toHaveLength(1);
  });

  it("treats a document whose element is the unit as one unit", () => {
    const lifted = liftDocument(`<item id="9"/>`, "item");
    expect(lifted.units).toHaveLength(1);
    expect(graph(lifted.units[0]!).getObjects(null, XYZ + "id", null)[0]!.value).toBe("9");
  });
});
