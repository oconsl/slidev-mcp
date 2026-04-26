import test from "node:test";
import assert from "node:assert/strict";
import { parse, parsePresentationDocument, parseSlideInput, serialize } from "./slides-parser.js";

test("parse canonical Slidev format and first-frontmatter behavior", () => {
  const raw = [
    "---",
    "title: Deck",
    "theme: default",
    "---",
    "# Slide 1",
    "",
    "Intro",
    "---",
    "# Slide 2",
    "",
    "More",
  ].join("\n");

  const parsed = parse(raw);
  assert.equal(parsed.headmatter, "title: Deck\ntheme: default");
  assert.equal(parsed.slides.length, 2);
  assert.equal(parsed.slides[0].content, "# Slide 1\n\nIntro");
  assert.equal(parsed.slides[1].content, "# Slide 2\n\nMore");
});

test("normalizes leading whitespace and BOM before initial frontmatter", () => {
  const raw = [
    "\uFEFF   ",
    "",
    "---",
    "title: Fixed",
    "---",
    "# Slide 1",
    "---",
    "# Slide 2",
  ].join("\n");

  const output = serialize(parse(raw));
  assert.ok(output.startsWith("---\n"));
  assert.equal(output.charCodeAt(0), 45);
  assert.equal(parse(output).slides.length, 2);
});

test("preserves per-slide frontmatter and avoids ghost slides on edit-like roundtrip", () => {
  const raw = [
    "   ",
    "---",
    "title: Demo",
    "---",
    "---",
    "layout: cover",
    "---",
    "# Cover",
    "---",
    "# Body",
  ].join("\n");

  const presentation = parse(raw);
  presentation.slides[1].content = "# Body\n\nUpdated";
  const output = serialize(presentation);
  const reparsed = parse(output);

  assert.ok(output.startsWith("---\n"));
  assert.equal(reparsed.slides.length, 2);
  assert.equal(reparsed.slides[0].frontmatter, "layout: cover");
  assert.equal(reparsed.slides[0].content, "# Cover");
  assert.equal(reparsed.slides[1].content, "# Body\n\nUpdated");
});

test("serializes later per-slide frontmatter without duplicate separators", () => {
  const raw = [
    "---",
    "title: Demo",
    "---",
    "# Intro",
    "---",
    "---",
    "layout: two-cols",
    "---",
    "# Details",
    "---",
    "---",
    "layout: image-right",
    "---",
    "# Wrap",
  ].join("\n");

  const output = serialize(parse(raw));
  const reparsed = parse(output);

  assert.equal(output.includes("# Intro\n---\n---\nlayout: two-cols"), false);
  assert.equal(output.includes("# Details\n---\n---\nlayout: image-right"), false);
  assert.equal(reparsed.slides.length, 3);
  assert.equal(reparsed.slides[1].frontmatter, "layout: two-cols");
  assert.equal(reparsed.slides[1].content, "# Details");
  assert.equal(reparsed.slides[2].frontmatter, "layout: image-right");
  assert.equal(reparsed.slides[2].content, "# Wrap");
});

test("parses canonical single-separator per-slide frontmatter", () => {
  const raw = [
    "---",
    "title: Demo",
    "---",
    "# Intro",
    "---",
    "layout: two-cols",
    "---",
    "# Details",
  ].join("\n");

  const parsed = parse(raw);
  assert.equal(parsed.slides.length, 2);
  assert.equal(parsed.slides[1].frontmatter, "layout: two-cols");
  assert.equal(parsed.slides[1].content, "# Details");
});

test("ignores --- inside code fences", () => {
  const raw = [
    "---",
    "title: Fences",
    "---",
    "# Slide 1",
    "",
    "```yaml",
    "---",
    "a: b",
    "---",
    "```",
    "",
    "After",
    "---",
    "# Slide 2",
  ].join("\n");

  const parsed = parse(raw);
  assert.equal(parsed.slides.length, 2);
  assert.ok(parsed.slides[0].content.includes("```yaml"));
  assert.ok(parsed.slides[0].content.includes("a: b"));
});

test("parse document reports leading whitespace while parse remains forgiving", () => {
  const raw = " \n---\ntitle: Demo\n---\n# Slide 1";
  const document = parsePresentationDocument(raw);

  assert.equal(parse(raw).slides.length, 1);
  assert.ok(document.diagnostics.some((issue) => issue.code === "LEADING_WHITESPACE"));
});

test("parseSlideInput rejects ambiguous bare separators outside fences", () => {
  assert.throws(
    () => parseSlideInput("# Bad\n\n---\n\nStill same input"),
    /bare '---' separator/
  );
});
