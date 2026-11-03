// Shared helpers for the checks: load the forms and labels, and build or
// parse issue bodies the way docs/parsing-contract.md describes.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const FORMS_DIR = join(ROOT, ".github", "ISSUE_TEMPLATE");
export const NO_RESPONSE = "_No response_";

export const readText = (path) => readFileSync(join(ROOT, path), "utf8");
export const readYaml = (path) => parse(readText(path));

/** Issue forms in chooser order, as [{ file, form }]. */
export function loadForms() {
  return readdirSync(FORMS_DIR)
    .filter((file) => file.endsWith(".yml") && file !== "config.yml")
    .sort()
    .map((file) => ({ file, form: readYaml(join(".github", "ISSUE_TEMPLATE", file)) }));
}

/** labels.yml as [{ name, color, description }], colours lower-cased. */
export function loadLabels() {
  return readYaml("labels.yml").map(({ name, color, description }) => ({
    name,
    color: String(color).toLowerCase(),
    description,
  }));
}

/** A form's input fields: everything except markdown blocks. */
export const fieldsOf = (form) => (form.body ?? []).filter((field) => field.type !== "markdown");

/** Split an issue body into [heading, content] pairs on its `### ` headings. */
export function parseSections(body) {
  const sections = [];
  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    if (line.startsWith("### ")) {
      sections.push([line.slice(4).trim(), []]);
    } else if (sections.length) {
      sections.at(-1)[1].push(line);
    }
  }
  return sections.map(([heading, lines]) => [heading, lines.join("\n").trim()]);
}

/** The value an agent would write for a field when filing a test issue. */
export function sampleValue(field) {
  if (!field.validations?.required) return NO_RESPONSE;
  if (field.type === "dropdown") return field.id === "source" ? "Agent" : field.attributes.options[0];
  if (field.id === "acceptance") return "- [ ] Live check passes";
  if (field.attributes?.render) return "```" + field.attributes.render + "\necho live check\n```";
  return "Filed by the live check.";
}

/** An issue body for a form, following the parsing contract. */
export const buildBody = (form) =>
  fieldsOf(form)
    .map((field) => `### ${field.attributes.label}\n\n${sampleValue(field)}`)
    .join("\n\n");
