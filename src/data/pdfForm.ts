/**
 * Minimal PDF AcroForm reader — enough to pull `/T` (field name) → `/V` (value)
 * pairs out of a PDF's raw bytes, with no runtime dependency.
 *
 * D&D Beyond's "Export to PDF" fills the official fillable character sheet, so a
 * DDB export already carries every stat as a named form field. Reading those is
 * far more reliable than extracting page text, and it keeps the whole importer
 * to a byte scan rather than a real PDF parser.
 *
 * Handled: classic objects, object streams (`/ObjStm`, Flate), literal and hex
 * strings, indirect string values, UTF-16BE and PDFDocEncoding text.
 * Not handled: encrypted files (rejected up front) and hierarchical field names
 * (the WotC sheet is flat).
 */

/** Field name (exactly as it appears in the PDF) -> value text. */
export type PdfFormFields = Record<string, string>;

/** PDFDocEncoding's 0x80–0xA0 block, where it diverges from Latin-1. */
const PDF_DOC_HIGH = "•†‡…—–ƒ⁄‹›−‰„“”‘’‚™ﬁﬂŁŒŠŸŽıłœšž�€";

const CHUNK = 0x8000;

/** Bytes -> a 1:1 Latin-1 string, so the scan can use ordinary string search. */
function toLatin1(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return out;
}

function toBytes(latin1: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(latin1.length);
  for (let i = 0; i < latin1.length; i++) out[i] = latin1.charCodeAt(i) & 0xff;
  return out;
}

/** Decode a raw PDF string's bytes: UTF-16BE when BOM-marked, else PDFDocEncoding. */
function decodePdfText(raw: string): string {
  if (raw.charCodeAt(0) === 0xfe && raw.charCodeAt(1) === 0xff) {
    let out = "";
    for (let i = 2; i + 1 < raw.length; i += 2) {
      out += String.fromCharCode((raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1));
    }
    return out;
  }
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    out += code >= 0x80 && code <= 0xa0 ? PDF_DOC_HIGH[code - 0x80] : String.fromCharCode(code);
  }
  return out;
}

const ESCAPES: Record<string, string> = {
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
  "(": "(",
  ")": ")",
  "\\": "\\",
};

/**
 * Read a literal `(...)` string starting at `start` (which must be the paren).
 * Returns the un-escaped raw bytes; parens nest and may be escaped.
 */
function readLiteralString(text: string, start: number): string {
  let depth = 0;
  let out = "";
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      const next = text[i + 1];
      if (next === undefined) break;
      if (next in ESCAPES) {
        out += ESCAPES[next];
        i += 1;
      } else if (next >= "0" && next <= "7") {
        let oct = "";
        while (oct.length < 3 && text[i + 1] >= "0" && text[i + 1] <= "7") {
          oct += text[i + 1];
          i += 1;
        }
        out += String.fromCharCode(parseInt(oct, 8) & 0xff);
      } else if (next === "\n" || next === "\r") {
        // Escaped newline = line continuation, contributes nothing.
        i += 1;
        if (next === "\r" && text[i + 1] === "\n") i += 1;
      } else {
        out += next;
        i += 1;
      }
      continue;
    }
    if (ch === "(") {
      depth += 1;
      if (depth === 1) continue;
    } else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return out;
    }
    out += ch;
  }
  return out;
}

/** Read a hex `<...>` string starting at `start` (the `<`). */
function readHexString(text: string, start: number): string {
  const end = text.indexOf(">", start);
  if (end === -1) return "";
  const digits = text.slice(start + 1, end).replace(/[^0-9A-Fa-f]/g, "");
  let out = "";
  for (let i = 0; i + 1 < digits.length; i += 2) {
    out += String.fromCharCode(parseInt(digits.slice(i, i + 2), 16));
  }
  // An odd trailing digit is padded with zero, per the spec.
  if (digits.length % 2) out += String.fromCharCode(parseInt(digits.slice(-1) + "0", 16));
  return out;
}

/** Skip whitespace from `i` onward. */
function skipSpace(text: string, i: number): number {
  while (i < text.length && /[\s\0]/.test(text[i])) i += 1;
  return i;
}

/**
 * Read the string value of a dictionary key (`/T`, `/V`), following one level of
 * indirect reference. Returns null when the key is absent or isn't a string.
 */
function readDictString(dict: string, key: string, objects: Map<number, string>): string | null {
  const found = new RegExp("/" + key + "(?![A-Za-z0-9])").exec(dict);
  if (!found) return null;
  const i = skipSpace(dict, found.index + found[0].length);
  const ch = dict[i];
  if (ch === "(") return decodePdfText(readLiteralString(dict, i));
  if (ch === "<" && dict[i + 1] !== "<") return decodePdfText(readHexString(dict, i));
  // `/Off`, `/Yes`, … — checkbox and radio states are stored as names.
  if (ch === "/") return /^\/([^\s/<>[\]()]*)/.exec(dict.slice(i))?.[1] ?? "";
  // `12 0 R` — the value lives in its own object.
  const ref = /^(\d+)\s+\d+\s+R\b/.exec(dict.slice(i));
  if (ref) {
    const target = objects.get(Number(ref[1]));
    if (target === undefined) return null;
    const j = skipSpace(target, 0);
    if (target[j] === "(") return decodePdfText(readLiteralString(target, j));
    if (target[j] === "<" && target[j + 1] !== "<") return decodePdfText(readHexString(target, j));
  }
  return null;
}

/**
 * Split an object body into its dictionary and (undecoded) stream payload.
 * The payload is exactly `/Length` bytes; an end-of-line may sit between it and
 * the `endstream` keyword, and handing that stray byte to the inflater fails
 * the whole stream, so trim to `/Length` when it's a direct number.
 */
function splitStream(body: string): { dict: string; data: string | null } {
  const i = body.indexOf("stream");
  if (i === -1) return { dict: body, data: null };
  const dict = body.slice(0, i);
  let start = i + "stream".length;
  if (body[start] === "\r") start += 1;
  if (body[start] === "\n") start += 1;
  const end = body.indexOf("endstream", start);
  if (end === -1) return { dict, data: null };

  let data = body.slice(start, end);
  const length = Number(/\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict)?.[1]);
  if (Number.isFinite(length) && length <= data.length) data = data.slice(0, length);
  else data = data.replace(/\r?\n$/, "");
  return { dict, data };
}

/** Collect every `N G obj … endobj` body, keyed by object number (last wins). */
function parseObjects(text: string): Map<number, string> {
  const objects = new Map<number, string>();
  const re = /(\d+)\s+\d+\s+obj\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const start = match.index + match[0].length;
    const end = text.indexOf("endobj", start);
    if (end === -1) break;
    objects.set(Number(match[1]), text.slice(start, end));
    re.lastIndex = end;
  }
  return objects;
}

/**
 * Flate-decode via the platform's DecompressionStream. PDF's FlateDecode is
 * zlib-wrapped, but some producers emit raw deflate, so try both. Driven through
 * the reader/writer pair rather than Blob/Response, which aren't uniformly
 * available outside the browser.
 */
async function inflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") return null;
  for (const format of ["deflate", "deflate-raw"] as const) {
    try {
      const stream = new DecompressionStream(format);
      const writer = stream.writable.getWriter();
      // Rejections surface on the read side; keep the write side from throwing
      // an unhandled one when the wrapper is wrong.
      void writer.write(data).catch(() => {});
      void writer.close().catch(() => {});

      const reader = stream.readable.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.length;
      }
      const out = new Uint8Array(size);
      let at = 0;
      for (const chunk of chunks) {
        out.set(chunk, at);
        at += chunk.length;
      }
      return out;
    } catch {
      // Wrong wrapper (or genuinely corrupt) — fall through to the next format.
    }
  }
  return null;
}

/**
 * Unpack `/ObjStm` container objects: PDFs written by Acrobat — including a DDB
 * export re-saved by a viewer — pack most dictionaries into compressed streams.
 * Each container starts with `N` pairs of "object number, relative offset".
 */
async function expandObjectStreams(objects: Map<number, string>): Promise<void> {
  for (const body of [...objects.values()]) {
    const { dict, data } = splitStream(body);
    if (data === null || !/\/Type\s*\/ObjStm\b/.test(dict)) continue;
    const count = Number(/\/N\s+(\d+)/.exec(dict)?.[1]);
    const first = Number(/\/First\s+(\d+)/.exec(dict)?.[1]);
    if (!Number.isFinite(count) || !Number.isFinite(first)) continue;
    const raw = /\/Filter\s*\/FlateDecode\b/.test(dict)
      ? await inflate(toBytes(data))
      : toBytes(data);
    if (!raw) continue;
    const payload = toLatin1(raw);
    const header = payload.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < count; i++) {
      const num = header[i * 2];
      const offset = header[i * 2 + 1];
      if (!Number.isFinite(num) || !Number.isFinite(offset)) break;
      const nextOffset = header[i * 2 + 3];
      const end = i + 1 < count && Number.isFinite(nextOffset) ? first + nextOffset : payload.length;
      objects.set(num, payload.slice(first + offset, end));
    }
  }
}

/**
 * Extract every AcroForm field value from a PDF. Fields that exist but are blank
 * come back as `""`, so callers can tell "no such field" from "left empty".
 *
 * @throws if the bytes aren't a PDF, or the file is encrypted.
 */
export async function readPdfFormFields(bytes: Uint8Array): Promise<PdfFormFields> {
  const text = toLatin1(bytes);
  if (!text.startsWith("%PDF-")) throw new Error("That file is not a PDF.");
  if (/\/Encrypt\s+\d+\s+\d+\s+R/.test(text)) {
    throw new Error("This PDF is password-protected, so its form fields can't be read.");
  }

  const objects = parseObjects(text);
  await expandObjectStreams(objects);

  const fields: PdfFormFields = {};
  for (const body of objects.values()) {
    const { dict } = splitStream(body);
    const name = readDictString(dict, "T", objects);
    if (name === null) continue;
    const value = readDictString(dict, "V", objects) ?? "";
    // The sheet repeats some fields across pages; the first filled one wins.
    if (!fields[name]) fields[name] = value;
  }
  return fields;
}

/**
 * Field names on the WotC sheet carry stray spaces and inconsistent casing
 * ("CHamod", "Wpn2 AtkBonus "), so every lookup goes through this.
 */
export function normalizeFieldName(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase();
}

/** Whitespace/case-insensitive reader over a field set. */
export function fieldReader(fields: PdfFormFields): (name: string) => string {
  const byNormal = new Map<string, string>();
  for (const [name, value] of Object.entries(fields)) {
    const key = normalizeFieldName(name);
    if (!byNormal.get(key)) byNormal.set(key, value);
  }
  return (name) => byNormal.get(normalizeFieldName(name))?.trim() ?? "";
}
