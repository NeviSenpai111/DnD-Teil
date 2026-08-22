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
    const body = "<< /T (Compressed) /V (works) >>";
    const header = "12 0 ";
    const payload = header + body;
    const compressor = new CompressionStream("deflate");
    const writer = compressor.writable.getWriter();
    void writer.write(encode(payload));
    void writer.close();
    const parts: Uint8Array[] = [];
    const reader = compressor.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
    }
    const deflated = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
    parts.reduce((at, part) => (deflated.set(part, at), at + part.length), 0);
    let binary = "";
    for (const byte of deflated) binary += String.fromCharCode(byte);
    const pdf =
      "%PDF-1.7\n1 0 obj\n" +
      `<< /Type /ObjStm /Filter /FlateDecode /N 1 /First ${header.length} /Length ${deflated.length} >>\n` +
      `stream\n${binary}\nendstream\nendobj\n%%EOF`;

    // Latin-1 round-trip: the deflate payload is bytes, not text.
    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
    const fields = await readPdfFormFields(bytes);
    expect(fields["Compressed"]).toBe("works");
  });
});

describe("fieldReader", () => {
  it("ignores the sheet's stray spaces and casing", async () => {
    const get = fieldReader(await readPdfFormFields(encode(SIMPLE)));
    expect(get("Wpn2 AtkBonus")).toBe("+7");
    expect(get("charactername")).toBe("Albert Zweistein");
    expect(get("NoSuchField")).toBe("");
  });
});
