/**
 * Tokenizes 5eTools inline markup.
 *
 * Strings embed tags shaped like `{@tag arg0|arg1|...}`. The tag name runs up to
 * the first whitespace; everything after is pipe-separated args. Braces nest
 * (a tag's arg can contain another tag), so both the closing-brace search and
 * the pipe split are brace-depth aware.
 */

export type TagToken =
  | { type: "text"; text: string }
  | { type: "tag"; tag: string; args: string[] };

/** Find the index of the `}` that closes the `{` at `start` (depth-aware). */
function findMatchingBrace(input: string, start: number): number {
  let depth = 0;
  for (let i = start; i < input.length; i++) {
    if (input[i] === "{") depth++;
    else if (input[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

/** Split a raw args string on `|`, ignoring pipes nested inside `{...}`. */
function splitArgs(raw: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of raw) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (ch === "|" && depth === 0) {
      args.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  args.push(cur);
  return args;
}

/** Parse the inside of a tag (without braces), e.g. "@hit 6" or "@h". */
function parseTag(inner: string): TagToken {
  const body = inner.slice(1); // drop leading '@'
  const sp = body.search(/\s/);
  if (sp === -1) return { type: "tag", tag: body, args: [] };
  return { type: "tag", tag: body.slice(0, sp), args: splitArgs(body.slice(sp + 1)) };
}

/** Tokenize a string into interleaved text and tag tokens. */
export function tokenize(input: string): TagToken[] {
  const tokens: TagToken[] = [];
  let text = "";
  let i = 0;

  const flush = () => {
    if (text) tokens.push({ type: "text", text });
    text = "";
  };

  while (i < input.length) {
    if (input[i] === "{" && input[i + 1] === "@") {
      const close = findMatchingBrace(input, i);
      if (close === -1) {
        // Unbalanced: treat the rest as literal text rather than dropping it.
        text += input.slice(i);
        break;
      }
      flush();
      tokens.push(parseTag(input.slice(i + 1, close)));
      i = close + 1;
    } else {
      text += input[i++];
    }
  }
  flush();
  return tokens;
}
