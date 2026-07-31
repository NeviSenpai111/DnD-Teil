import { describe, expect, it } from "vitest";
import { tokenize } from "./tokenizer";

describe("tokenize", () => {
  it("returns a single text token for plain text", () => {
    expect(tokenize("hello world")).toEqual([{ type: "text", text: "hello world" }]);
  });

  it("parses a tag with no args", () => {
    expect(tokenize("{@h}")).toEqual([{ type: "tag", tag: "h", args: [] }]);
  });

  it("parses a tag with a single arg", () => {
    expect(tokenize("{@hit 6}")).toEqual([{ type: "tag", tag: "hit", args: ["6"] }]);
    expect(tokenize("{@atk rw}")).toEqual([{ type: "tag", tag: "atk", args: ["rw"] }]);
    expect(tokenize("{@damage 6d8}")).toEqual([{ type: "tag", tag: "damage", args: ["6d8"] }]);
  });

  it("parses pipe-separated args (name|source|display)", () => {
    expect(tokenize("{@spell fireball|xphb|fire ball}")).toEqual([
      { type: "tag", tag: "spell", args: ["fireball", "xphb", "fire ball"] },
    ]);
  });

  it("interleaves text and tags (the antimatter attack line)", () => {
    const line = "{@atk rw} {@hit 6} to hit. {@h}16 ({@damage 6d8}) necrotic damage.";
    expect(tokenize(line)).toEqual([
      { type: "tag", tag: "atk", args: ["rw"] },
      { type: "text", text: " " },
      { type: "tag", tag: "hit", args: ["6"] },
      { type: "text", text: " to hit. " },
      { type: "tag", tag: "h", args: [] },
      { type: "text", text: "16 (" },
      { type: "tag", tag: "damage", args: ["6d8"] },
      { type: "text", text: ") necrotic damage." },
    ]);
  });

  it("handles nested tags and keeps inner braces in the arg", () => {
    expect(tokenize("{@b bold {@i and italic}}")).toEqual([
      { type: "tag", tag: "b", args: ["bold {@i and italic}"] },
    ]);
  });

  it("splits top-level pipes but not pipes nested in braces", () => {
    expect(tokenize("{@b {@i a|b}|c}")).toEqual([
      { type: "tag", tag: "b", args: ["{@i a|b}", "c"] },
    ]);
  });

  it("treats a lone { (not {@) as literal text", () => {
    expect(tokenize("use {curly} braces")).toEqual([
      { type: "text", text: "use {curly} braces" },
    ]);
  });

  it("treats an unbalanced {@ as literal text", () => {
    expect(tokenize("oops {@damage 6d8")).toEqual([
      { type: "text", text: "oops {@damage 6d8" },
    ]);
  });
});
