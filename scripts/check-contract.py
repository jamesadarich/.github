#!/usr/bin/env python3
"""Check that the issue forms, labels.yml and the parsing contract agree.

Checks:
  - every input in every form has a unique id;
  - every form has a `source` dropdown labelled `Filed by`;
  - every label a form applies appears in labels.yml;
  - every field label in the forms appears in docs/parsing-contract.md.

Exits non-zero and prints each problem if any check fails.
"""
import pathlib
import sys

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
FORMS_DIR = ROOT / ".github" / "ISSUE_TEMPLATE"
LABELS = ROOT / "labels.yml"
CONTRACT = ROOT / "docs" / "parsing-contract.md"


def main() -> int:
    errors: list[str] = []

    manifest = yaml.safe_load(LABELS.read_text())
    known_labels = {entry["name"] for entry in manifest}
    contract = CONTRACT.read_text()

    forms = sorted(p for p in FORMS_DIR.glob("*.yml") if p.name != "config.yml")
    if not forms:
        errors.append(f"no issue forms found in {FORMS_DIR}")

    for path in forms:
        name = path.relative_to(ROOT)
        form = yaml.safe_load(path.read_text())

        for label in form.get("labels") or []:
            if label not in known_labels:
                errors.append(f"{name}: label '{label}' is not in labels.yml")

        ids: set[str] = set()
        has_source = False
        for field in form.get("body") or []:
            if field.get("type") == "markdown":
                continue
            field_id = field.get("id")
            label = (field.get("attributes") or {}).get("label", "")
            if not field_id:
                errors.append(f"{name}: field '{label}' has no id")
            elif field_id in ids:
                errors.append(f"{name}: duplicate id '{field_id}'")
            else:
                ids.add(field_id)

            if field_id == "source":
                if field.get("type") == "dropdown" and label == "Filed by":
                    has_source = True
                else:
                    errors.append(
                        f"{name}: 'source' must be a dropdown labelled 'Filed by'"
                    )

            if label and f"### {label}" not in contract:
                errors.append(
                    f"{name}: label '{label}' is not documented as '### {label}' "
                    f"in docs/parsing-contract.md"
                )

        if not has_source:
            errors.append(f"{name}: missing 'source' dropdown labelled 'Filed by'")

    for error in errors:
        print(f"error: {error}", file=sys.stderr)
    if not errors:
        print(f"ok: {len(forms)} forms match labels.yml and the parsing contract")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
