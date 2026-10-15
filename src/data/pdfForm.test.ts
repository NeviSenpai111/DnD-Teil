import { describe, expect, it } from "vitest";
import { fieldReader, readPdfFormFields } from "./pdfForm";

const encode = (text: string) => new TextEncoder().encode(text);

/** A hand-written PDF with one widget per case the reader has to cover. */
const SIMPLE = [
  "%PDF-1.7",
  "1 0 obj",
  "<< /Type /Annot /Subtype /Widget /FT /Tx /T (CharacterName) /V (Albert Zweistein) >>",
  "endobj",
  // UTF-16BE with a BOM — how DDB writes anything non-ASCII.
  "2 0 obj",
  "<< /FT /Tx /T (Backstory) /V <FEFF004B00E40074007A> >>",
  "endobj",
  // PDFDocEncoding: octal \\200 is a bullet, DDB's "proficient" marker.
  "3 0 obj",
  "<< /T (ConProf) /V (\\200) >>",
  "endobj",
  // The value lives in its own object.
  "4 0 obj",
  "<< /T (Notes) /V 5 0 R >>",
  "endobj",
  "5 0 obj",
  "(talks to his gun \\(a lot\\))",
  "endobj",
  // Present but never filled in.
  "6 0 obj",
  "<< /T (Ideals) >>",
  "endobj",
  // The sheet repeats fields across pages; the filled copy wins.
  "7 0 obj",
  "<< /T (RACE) >>",
  "endobj",
  "8 0 obj",
  "<< /T (RACE) /V (Variant Human) >>",
  "endobj",
  // /TU (tooltip) and /Type must not be mistaken for /T.
  "9 0 obj",
  "<< /T (Wpn2 AtkBonus ) /TU (Attack bonus) /V (+7) >>",
  "endobj",
  "trailer << /Root 1 0 R >>",
  "%%EOF",
].join("\n");

describe("readPdfFormFields", () => {
  it("reads literal, hex, PDFDocEncoded and indirect field values", async () => {
    const fields = await readPdfFormFields(encode(SIMPLE));
    expect(fields["CharacterName"]).toBe("Albert Zweistein");
    expect(fields["Backstory"]).toBe("Kätz");
    expect(fields["ConProf"]).toBe("•");
    expect(fields["Notes"]).toBe("talks to his gun (a lot)");
  });

  it("keeps empty fields, and prefers a filled duplicate", async () => {
    const fields = await readPdfFormFields(encode(SIMPLE));
    expect(fields["Ideals"]).toBe("");
    expect(fields["RACE"]).toBe("Variant Human");
  });

  it("rejects non-PDFs and encrypted PDFs", async () => {
    await expect(readPdfFormFields(encode("not a pdf"))).rejects.toThrow(/not a PDF/i);
    await expect(
      readPdfFormFields(encode("%PDF-1.7\ntrailer << /Encrypt 9 0 R >>")),
    ).rejects.toThrow(/password-protected/i);
  });

  it("reads fields out of object streams", async () => {
    const bodies = ["<< /T (FromStream) /V (yes) >>", "<< /T (Second) /V (2) >>"];
    const offsets: number[] = [];
    let packed = "";
    for (const body of bodies) {
      offsets.push(packed.length);
      packed += `${body} `;
    }
    const header = `10 ${offsets[0]} 11 ${offsets[1]} `;
    const payload = header + packed;
    const pdf = [
      "%PDF-1.7",
      "1 0 obj",
      `<< /Type /ObjStm /N 2 /First ${header.length} /Length ${payload.length} >>`,
      "stream",
      payload,
      "endstream",
      "endobj",
      "%%EOF",
    ].join("\n");

    const fields = await readPdfFormFields(encode(pdf));
    expect(fields["FromStream"]).toBe("yes");
    expect(fields["Second"]).toBe("2");
  });

  it("inflates Flate-compressed object streams", async () => {
    const pdf = await flatePdf([await flateObjStm(1, 12, "<< /T (Compressed) /V (works) >>")]);
    const fields = await readPdfFormFields(pdf);
    expect(fields["Compressed"]).toBe("works");
  });

  it("refuses a PDF whose compressed streams expand past the limit", async () => {
    const big = (n: number) => `<< /T (Big${n}) /V (${"x".repeat(600)}) >>`;
    const one = await flatePdf([await flateObjStm(1, 12, big(1))]);
    const two = await flatePdf([await flateObjStm(1, 12, big(1)), await flateObjStm(2, 13, big(2))]);
    // One stream over the limit, or several that only add up to more than it.
    await expect(readPdfFormFields(one, 500)).rejects.toThrow(/too large/i);
    await expect(readPdfFormFields(two, 1000)).rejects.toThrow(/too large/i);
    expect(Object.keys(await readPdfFormFields(two))).toEqual(["Big1", "Big2"]);
  });
});

/** Deflate text into a Latin-1 string: the payload is bytes, not text. */
async function deflate(text: string): Promise<string> {
  const compressor = new CompressionStream("deflate");
  const writer = compressor.writable.getWriter();
  void writer.write(encode(text));
  void writer.close();
  let binary = "";
  const reader = compressor.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const byte of value) binary += String.fromCharCode(byte);
  }
  return binary;
}

/** Object `num`: a Flate-compressed object stream holding `body` as object `inner`. */
async function flateObjStm(num: number, inner: number, body: string): Promise<string> {
  const header = `${inner} 0 `;
  const deflated = await deflate(header + body);
  return (
    `${num} 0 obj\n<< /Type /ObjStm /Filter /FlateDecode /N 1 /First ${header.length} /Length ${deflated.length} >>\n` +
    `stream\n${deflated}\nendstream\nendobj\n`
  );
}

/** A PDF of the given objects, as Latin-1 bytes. */
async function flatePdf(objects: string[]): Promise<Uint8Array> {
  const pdf = `%PDF-1.7\n${objects.join("")}%%EOF`;
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

describe("fieldReader", () => {
  it("ignores the sheet's stray spaces and casing", async () => {
    const get = fieldReader(await readPdfFormFields(encode(SIMPLE)));
    expect(get("Wpn2 AtkBonus")).toBe("+7");
    expect(get("charactername")).toBe("Albert Zweistein");
    expect(get("NoSuchField")).toBe("");
  });
});
