import test from "node:test";
import assert from "node:assert/strict";
import { verifySlidesMd } from "../tools/verify-presentation.js";

// ─── Helper ───────────────────────────────────────────────────────────────────

function lines(...rows: string[]): string {
  return rows.join("\n");
}

// ─── Valid presentations ──────────────────────────────────────────────────────

test("verify: valid canonical presentation passes with no issues", () => {
  const raw = lines(
    "---",
    "title: Demo",
    "theme: seriph",
    "---",
    "# Slide 1",
    "",
    "Hello world",
    "---",
    "# Slide 2",
    "",
    "More content"
  );
  const result = verifySlidesMd(raw);
  assert.equal(result.valid, true);
  assert.equal(result.errorCount, 0);
  assert.equal(result.warningCount, 0);
});

test("verify: valid presentation with per-slide frontmatter passes", () => {
  const raw = lines(
    "---",
    "title: Demo",
    "---",
    "---",
    "layout: cover",
    "---",
    "# Cover Slide",
    "---",
    "# Regular Slide"
  );
  const result = verifySlidesMd(raw);
  assert.equal(result.valid, true);
  assert.equal(result.errorCount, 0);
});

test("verify: --- inside code fence is NOT flagged as separator", () => {
  const raw = lines(
    "---",
    "title: Fences",
    "---",
    "# Slide 1",
    "",
    "```yaml",
    "---",
    "key: value",
    "---",
    "```",
    "",
    "After fence",
    "---",
    "# Slide 2"
  );
  const result = verifySlidesMd(raw);
  assert.equal(result.valid, true);
  assert.equal(result.errorCount, 0);
  // No empty slides either (the fence content doesn't create an empty slide)
  assert.equal(result.warningCount, 0);
});

// ─── Leading noise errors ─────────────────────────────────────────────────────

test("verify: BOM at start produces LEADING_BOM error", () => {
  const raw = "\uFEFF---\ntitle: Demo\n---\n# Slide 1";
  const result = verifySlidesMd(raw);
  assert.equal(result.valid, false);
  const bom = result.issues.find((i) => i.code === "LEADING_BOM");
  assert.ok(bom, "Expected LEADING_BOM issue");
  assert.equal(bom.severity, "error");
});

test("verify: leading whitespace before --- produces LEADING_WHITESPACE error", () => {
  const raw = "   \n---\ntitle: Demo\n---\n# Slide 1";
  const result = verifySlidesMd(raw);
  assert.equal(result.valid, false);
  const ws = result.issues.find((i) => i.code === "LEADING_WHITESPACE");
  assert.ok(ws, "Expected LEADING_WHITESPACE issue");
});

test("verify: file with no headmatter at all produces MISSING_HEADMATTER error", () => {
  const raw = "# Slide 1\n\nsome content";
  const result = verifySlidesMd(raw);
  assert.equal(result.valid, false);
  const missing = result.issues.find((i) => i.code === "MISSING_HEADMATTER");
  assert.ok(missing, "Expected MISSING_HEADMATTER issue");
});

// ─── Headmatter errors ────────────────────────────────────────────────────────

test("verify: unclosed global frontmatter produces UNCLOSED_HEADMATTER error", () => {
  const raw = lines("---", "title: Demo", "theme: seriph", "# Slide 1");
  const result = verifySlidesMd(raw);
  assert.equal(result.valid, false);
  const uc = result.issues.find((i) => i.code === "UNCLOSED_HEADMATTER");
  assert.ok(uc, "Expected UNCLOSED_HEADMATTER issue");
});

test("verify: invalid YAML in headmatter produces INVALID_HEADMATTER_YAML error", () => {
  const raw = lines(
    "---",
    "title: [unclosed bracket",
    "---",
    "# Slide 1"
  );
  const result = verifySlidesMd(raw);
  assert.equal(result.valid, false);
  const yamlErr = result.issues.find((i) => i.code === "INVALID_HEADMATTER_YAML");
  assert.ok(yamlErr, "Expected INVALID_HEADMATTER_YAML issue");
});

// ─── Per-slide frontmatter errors ─────────────────────────────────────────────

test("verify: invalid YAML in per-slide frontmatter produces INVALID_SLIDE_FRONTMATTER_YAML", () => {
  const raw = lines(
    "---",
    "title: Demo",
    "---",
    "---",
    "layout: [broken yaml",
    "---",
    "# Slide 1"
  );
  const result = verifySlidesMd(raw);
  assert.equal(result.valid, false);
  const yamlErr = result.issues.find((i) => i.code === "INVALID_SLIDE_FRONTMATTER_YAML");
  assert.ok(yamlErr, "Expected INVALID_SLIDE_FRONTMATTER_YAML issue");
  assert.ok(yamlErr.location.includes("slide 1"), `Expected location to reference slide 1, got: ${yamlErr.location}`);
});

test("verify: unclosed per-slide frontmatter produces UNCLOSED_SLIDE_FRONTMATTER error", () => {
  const raw = lines(
    "---",
    "title: Demo",
    "---",
    "---",
    "layout: cover"
    // no closing ---
  );
  const result = verifySlidesMd(raw);
  assert.equal(result.valid, false);
  const uc = result.issues.find((i) => i.code === "UNCLOSED_SLIDE_FRONTMATTER");
  assert.ok(uc, "Expected UNCLOSED_SLIDE_FRONTMATTER issue");
});

// ─── Code fence errors ────────────────────────────────────────────────────────

test("verify: unclosed code fence produces UNCLOSED_CODE_FENCE error", () => {
  const raw = lines(
    "---",
    "title: Demo",
    "---",
    "# Slide 1",
    "",
    "```typescript",
    "const x = 1;"
    // missing closing ```
  );
  const result = verifySlidesMd(raw);
  assert.equal(result.valid, false);
  const fence = result.issues.find((i) => i.code === "UNCLOSED_CODE_FENCE");
  assert.ok(fence, "Expected UNCLOSED_CODE_FENCE issue");
  assert.equal(fence.severity, "error");
});

// ─── Empty slide warnings ─────────────────────────────────────────────────────

test("verify: empty slide between two slides produces EMPTY_SLIDE warning", () => {
  // A bare --- inside content creates an unexpected empty slide
  const raw = lines(
    "---",
    "title: Demo",
    "---",
    "# Slide 1",
    "",
    "Content here",
    "---",
    "---",   // <--- bare --- that creates an empty slide
    "# Slide 3"
  );
  const result = verifySlidesMd(raw);
  // The double --- means: separator, then another separator = empty slide 2
  const emptySlides = result.issues.filter((i) => i.code === "EMPTY_SLIDE");
  assert.ok(emptySlides.length > 0, "Expected at least one EMPTY_SLIDE warning");
  assert.equal(emptySlides[0].severity, "warning");
});

// ─── Summary messages ─────────────────────────────────────────────────────────

test("verify: valid summary starts with ✅", () => {
  const raw = lines("---", "title: Demo", "---", "# Slide 1");
  const result = verifySlidesMd(raw);
  assert.ok(result.summary.startsWith("✅"));
});

test("verify: error summary starts with ❌", () => {
  const raw = "   \n---\ntitle: Bad\n---\n# Slide 1";
  const result = verifySlidesMd(raw);
  assert.ok(result.summary.startsWith("❌"));
});
