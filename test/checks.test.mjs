import assert from "node:assert/strict";
import { test } from "node:test";
import { checkContract } from "../scripts/check-contract.mjs";
import { checkIssue } from "../scripts/check-live.mjs";
import { buildBody, loadForms, loadLabels, NO_RESPONSE, parseSections, readText, readYaml } from "../scripts/lib.mjs";

const forms = loadForms();
const labels = loadLabels();
const contract = readText("docs/parsing-contract.md");

test("forms load in chooser order", () => {
  assert.deepEqual(forms.map((f) => f.form.name), ["Bug report", "Feature request", "Task"]);
});

test("label colours are six-digit hex strings", () => {
  for (const { name, color } of labels) assert.match(color, /^[0-9a-f]{6}$/, name);
});

test("the repo passes the contract check", () => {
  assert.deepEqual(checkContract({ forms, labels, contract }), []);
});

test("the contract check catches drift", () => {
  const form = structuredClone(forms[0].form);
  form.labels.push("unknown-label");
  form.body.find((f) => f.id === "summary").attributes.label = "Overview";
  form.body = form.body.filter((f) => f.id !== "source");
  const errors = checkContract({ forms: [{ file: "x.yml", form }], labels, contract });
  assert.ok(errors.some((e) => e.includes("'unknown-label' is not in labels.yml")));
  assert.ok(errors.some((e) => e.includes("'Overview' is not documented")));
  assert.ok(errors.some((e) => e.includes("missing 'source' dropdown")));
});

test("a built body parses back to the form's headings", () => {
  for (const entry of forms) {
    const issue = {
      body: buildBody(entry.form).replace(/\n/g, "\r\n"),
      labels: [...entry.form.labels, "filed-by-agent"].map((name) => ({ name })),
    };
    assert.deepEqual(checkIssue(entry, issue), [], entry.file);
  }
});

test("optional fields use _No response_ and code blocks stay inside their section", () => {
  const sections = new Map(parseSections(buildBody(forms[2].form)));
  assert.equal(sections.get("Context"), NO_RESPONSE);
  assert.equal(sections.get("How to verify"), "```shell\necho live check\n```");
});

test("checkIssue reports wrong headings, Filed by and missing labels", () => {
  const entry = forms[0];
  const body = buildBody(entry.form).replace("### Severity", "### Sev").replace(/Agent$/, "Human");
  const errors = checkIssue(entry, { body, labels: [{ name: "bug" }] });
  assert.ok(errors.some((e) => e.includes("headings")));
  assert.ok(errors.some((e) => e.includes("'Filed by' is 'Human'")));
  assert.ok(errors.some((e) => e.includes("'needs-triage' not applied")));
  assert.ok(errors.some((e) => e.includes("'filed-by-agent' not applied")));
});

test("AGENTS.md carries the README's snippet word for word", () => {
  const readme = readText("README.md");
  const section = readme.slice(readme.indexOf("### AGENTS.md snippet"));
  const snippet = section.match(/```markdown\n([\s\S]*?)\n```/)?.[1];
  assert.ok(snippet, "README has no AGENTS.md snippet");
  assert.ok(readText("AGENTS.md").includes(snippet), "AGENTS.md does not contain the README snippet");
});

test("every label Dependabot applies is in labels.yml", () => {
  const known = new Set(labels.map((label) => label.name));
  const used = readYaml(".github/dependabot.yml").updates.flatMap((update) => update.labels ?? []);
  assert.ok(used.length, "dependabot.yml applies no labels");
  for (const label of used) assert.ok(known.has(label), `'${label}' is not in labels.yml`);
});
