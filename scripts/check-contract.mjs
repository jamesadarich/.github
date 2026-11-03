#!/usr/bin/env node
// Check that the issue forms, labels.yml and the parsing contract agree:
//   - every input in every form has a unique id;
//   - every form has a `source` dropdown labelled `Filed by`;
//   - every label a form applies appears in labels.yml;
//   - every field label in the forms appears in docs/parsing-contract.md.
// Exits non-zero and prints each problem if any check fails.
import { fieldsOf, loadForms, loadLabels, readText } from "./lib.mjs";

export function checkContract({ forms, labels, contract }) {
  const errors = [];
  const known = new Set(labels.map((label) => label.name));
  if (!forms.length) errors.push("no issue forms found in .github/ISSUE_TEMPLATE");

  for (const { file, form } of forms) {
    for (const label of form.labels ?? []) {
      if (!known.has(label)) errors.push(`${file}: label '${label}' is not in labels.yml`);
    }

    const ids = new Set();
    let hasSource = false;
    for (const field of fieldsOf(form)) {
      const label = field.attributes?.label ?? "";
      if (!field.id) errors.push(`${file}: field '${label}' has no id`);
      else if (ids.has(field.id)) errors.push(`${file}: duplicate id '${field.id}'`);
      else ids.add(field.id);

      if (field.id === "source") {
        if (field.type === "dropdown" && label === "Filed by") hasSource = true;
        else errors.push(`${file}: 'source' must be a dropdown labelled 'Filed by'`);
      }

      if (label && !contract.includes(`### ${label}`)) {
        errors.push(`${file}: label '${label}' is not documented as '### ${label}' in docs/parsing-contract.md`);
      }
    }
    if (!hasSource) errors.push(`${file}: missing 'source' dropdown labelled 'Filed by'`);
  }
  return errors;
}

if (import.meta.main ?? process.argv[1] === new URL(import.meta.url).pathname) {
  const forms = loadForms();
  const errors = checkContract({
    forms,
    labels: loadLabels(),
    contract: readText("docs/parsing-contract.md"),
  });
  for (const error of errors) console.error(`error: ${error}`);
  if (errors.length) process.exit(1);
  console.log(`ok: ${forms.length} forms match labels.yml and the parsing contract`);
}
