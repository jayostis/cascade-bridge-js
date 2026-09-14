// The lift of the sparql-1.1 profile: XML into Facade-X-shaped N-Triples.
//
// A mapping never sees the document. It sees one unit, lifted with the unit
// element as the root; the detect query sees the skeleton, which is the whole
// document with every unit reduced to an empty container. One pass yields both,
// so no unit is ever lifted inside another's graph.
import { SaxesParser, type SaxesAttributeNS, type SaxesTagNS } from "saxes";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
export const FX = "http://sparql.xyz/facade-x/ns/";
export const XYZ = "http://sparql.xyz/facade-x/data/";
const TYPE = `<${RDF}type>`;
const ROOT = `<${FX}root>`;

export interface LiftedDocument {
  /** The whole document, each unit an empty container: what a detect query reads. */
  skeleton: string;
  /** One N-Triples document per unit, the unit element as root, in document order. */
  units: string[];
}

function literal(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;
}

// A name that is not a valid IRI character sequence is percent-encoded, so an
// odd local name costs a readable IRI and never a parse failure.
function name(ns: string, local: string): string {
  const safe = local.replace(
    /[^A-Za-z0-9_.\-]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"),
  );
  return `<${ns}${safe}>`;
}

function elementType(tag: SaxesTagNS): string {
  return tag.uri ? name(tag.uri, tag.local) : name(XYZ, tag.local);
}

function attributeLines(id: string, tag: SaxesTagNS, out: string[]): void {
  for (const a of Object.values(tag.attributes) as SaxesAttributeNS[]) {
    if (a.prefix === "xmlns" || a.name === "xmlns") continue;
    const p = a.uri ? name(a.uri, a.local) : name(XYZ, a.local || a.name);
    out.push(`${id} ${p} ${literal(a.value)} .`);
  }
}

type Frame =
  | { kind: "skeleton"; id: string; members: number }
  | { kind: "unit"; id: string; members: number };

/**
 * Lift a document. With `unit` given, every outermost element of that local
 * name becomes its own lifted unit and an empty container in the skeleton.
 * Without it, the skeleton is the whole document lifted and there are no units.
 */
export function liftDocument(xml: string, unit?: string): LiftedDocument {
  const skeleton: string[] = [];
  const units: string[] = [];
  let current: string[] | undefined;
  const stack: Frame[] = [];
  let next = 0;
  let text = "";

  // Whitespace is XML's S production, not Unicode's: a no-break space is text.
  const flush = () => {
    const top = stack[stack.length - 1];
    if (top && /[^ \t\r\n]/.test(text)) {
      top.members += 1;
      (top.kind === "unit" ? current! : skeleton).push(`${top.id} <${RDF}_${top.members}> ${literal(text)} .`);
    }
    text = "";
  };

  const parser = new SaxesParser({ xmlns: true });
  parser.on("text", (t) => {
    text += t;
  });
  parser.on("cdata", (t) => {
    text += t;
  });
  parser.on("opentag", (tag) => {
    flush();
    const parent = stack[stack.length - 1];
    const type = elementType(tag);

    if (parent?.kind === "unit") {
      const id = `_:b${next++}`;
      parent.members += 1;
      current!.push(`${parent.id} <${RDF}_${parent.members}> ${id} .`, `${id} ${TYPE} ${type} .`);
      attributeLines(id, tag, current!);
      stack.push({ kind: "unit", id, members: 0 });
      return;
    }

    // Outside any unit: the element belongs to the skeleton.
    const sid = `_:b${next++}`;
    if (parent) {
      parent.members += 1;
      skeleton.push(`${parent.id} <${RDF}_${parent.members}> ${sid} .`);
    } else {
      skeleton.push(`${sid} ${TYPE} ${ROOT} .`);
    }
    skeleton.push(`${sid} ${TYPE} ${type} .`);

    if (unit !== undefined && tag.local === unit) {
      const uid = `_:b${next++}`;
      current = [`${uid} ${TYPE} ${ROOT} .`, `${uid} ${TYPE} ${type} .`];
      attributeLines(uid, tag, current);
      stack.push({ kind: "unit", id: uid, members: 0 });
      return;
    }
    attributeLines(sid, tag, skeleton);
    stack.push({ kind: "skeleton", id: sid, members: 0 });
  });
  parser.on("closetag", () => {
    flush();
    const frame = stack.pop()!;
    const parent = stack[stack.length - 1];
    if (frame.kind === "unit" && parent?.kind !== "unit") {
      units.push(current!.join("\n") + "\n");
      current = undefined;
    }
  });
  parser.write(xml).close();

  return { skeleton: skeleton.join("\n") + "\n", units };
}
