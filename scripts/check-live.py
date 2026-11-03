#!/usr/bin/env python3
"""Check the published .github repo on live GitHub.

These checks cover what validate.yml can't see from a checkout. Each one
is a subcommand, so the workflow reports them as separate steps:

  visibility        the repo is public
  raw-urls          every raw URL in the README returns 200 as text/plain
  templates REPO    GitHub reports every form as an issue template for REPO
  labels            the repo's labels match labels.yml exactly
  round-trip        file one issue per form outside the form (as an agent
                    would), read it back, check it against the contract,
                    then close it

Needs an authenticated `gh`. The repo comes from GITHUB_REPOSITORY.
"""
import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.request

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
FORMS_DIR = ROOT / ".github" / "ISSUE_TEMPLATE"
NO_RESPONSE = "_No response_"
REPO = os.environ.get("GITHUB_REPOSITORY", "jamesadarich/.github")


def gh(*args: str, stdin: str | None = None) -> str:
    result = subprocess.run(
        ["gh", *args], input=stdin, capture_output=True, text=True, check=False
    )
    if result.returncode != 0:
        raise SystemExit(f"gh {' '.join(args)} failed:\n{result.stderr}")
    return result.stdout


def load_forms() -> list[tuple[str, dict]]:
    paths = sorted(p for p in FORMS_DIR.glob("*.yml") if p.name != "config.yml")
    return [(p.name, yaml.safe_load(p.read_text())) for p in paths]


def inputs(form: dict) -> list[dict]:
    return [f for f in form.get("body") or [] if f.get("type") != "markdown"]


def fail(errors: list[str]) -> int:
    for error in errors:
        print(f"error: {error}", file=sys.stderr)
    return 1 if errors else 0


def check_visibility() -> int:
    visibility = gh("api", f"repos/{REPO}", "--jq", ".visibility").strip()
    print(f"{REPO} visibility: {visibility}")
    if visibility != "public":
        return fail([f"{REPO} must be public; GitHub ignores defaults in a private .github repo"])
    return 0


def check_raw_urls() -> int:
    readme = (ROOT / "README.md").read_text()
    urls = sorted(set(re.findall(r"https://raw\.githubusercontent\.com/\S+", readme)))
    errors = []
    if not urls:
        errors.append("README lists no raw URLs")
    for url in urls:
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                status = response.status
                content_type = response.headers.get("Content-Type", "")
        except Exception as exc:  # noqa: BLE001 - report any fetch failure
            errors.append(f"{url}: {exc}")
            continue
        print(f"{status} {content_type} {url}")
        if status != 200 or not content_type.startswith("text/plain"):
            errors.append(f"{url}: expected 200 text/plain, got {status} {content_type}")
    return fail(errors)


def check_templates(repo: str) -> int:
    owner, name = repo.split("/", 1)
    query = (
        "query($owner: String!, $name: String!) {"
        " repository(owner: $owner, name: $name) { issueTemplates { name } } }"
    )
    data = json.loads(
        gh("api", "graphql", "-f", f"query={query}", "-f", f"owner={owner}", "-f", f"name={name}")
    )
    reported = [t["name"] for t in data["data"]["repository"]["issueTemplates"] or []]
    expected = [form["name"] for _, form in load_forms()]
    print(f"{repo} issue templates: {reported}")
    missing = [n for n in expected if n not in reported]
    if missing:
        return fail(
            [f"{repo}: GitHub does not report {missing}. The form may be invalid, "
             f"or the repo has its own ISSUE_TEMPLATE folder."]
        )
    return 0


def check_labels() -> int:
    want = {
        e["name"]: (str(e["color"]).lower(), e["description"])
        for e in yaml.safe_load((ROOT / "labels.yml").read_text())
    }
    have = {
        e["name"]: (e["color"].lower(), e["description"])
        for e in json.loads(
            gh("label", "list", "--repo", REPO, "--limit", "1000", "--json", "name,color,description")
        )
    }
    errors = [
        f"label '{name}': expected {value}, found {have.get(name)}"
        for name, value in want.items()
        if have.get(name) != value
    ]
    if not errors:
        print(f"{REPO}: all {len(want)} labels match labels.yml")
    return fail(errors)


def sample_value(field: dict) -> str:
    """A value an agent would write for this field."""
    if not (field.get("validations") or {}).get("required"):
        return NO_RESPONSE
    if field["type"] == "dropdown":
        return "Agent" if field["id"] == "source" else field["attributes"]["options"][0]
    if field["id"] == "acceptance":
        return "- [ ] Live check passes"
    if (field.get("attributes") or {}).get("render"):
        return f"```{field['attributes']['render']}\necho live check\n```"
    return "Filed by the live check."


def parse_sections(body: str) -> list[tuple[str, str]]:
    """Split an issue body on its `### ` headings, as a reader of the contract would."""
    sections = []
    for chunk in re.split(r"^### ", body.replace("\r\n", "\n"), flags=re.M)[1:]:
        heading, _, content = chunk.partition("\n")
        sections.append((heading.strip(), content.strip()))
    return sections


def check_round_trip() -> int:
    errors = []
    for filename, form in load_forms():
        fields = inputs(form)
        body = "\n\n".join(
            f"### {f['attributes']['label']}\n\n{sample_value(f)}" for f in fields
        )
        labels = [*form.get("labels", []), "filed-by-agent"]
        args = ["issue", "create", "--repo", REPO, "--body-file", "-",
                "--title", f"{form.get('title', '')}Live check ({filename})"]
        for label in labels:
            args += ["--label", label]
        url = gh(*args, stdin=body).strip().splitlines()[-1]
        print(f"{filename}: filed {url}")
        try:
            issue = json.loads(gh("issue", "view", url, "--json", "body,labels"))
            sections = parse_sections(issue["body"])
            headings = [h for h, _ in sections]
            expected = [f["attributes"]["label"] for f in fields]
            if headings != expected:
                errors.append(f"{filename}: headings {headings} != contract {expected}")
            values = dict(sections)
            if values.get("Filed by") != "Agent":
                errors.append(f"{filename}: 'Filed by' is {values.get('Filed by')!r}, expected 'Agent'")
            applied = {label["name"] for label in issue["labels"]}
            missing = sorted(set(labels) - applied)
            if missing:
                errors.append(f"{filename}: labels not applied: {missing}")
        finally:
            gh("issue", "close", url, "--reason", "not planned",
               "--comment", "Closed automatically by the live check.")
    return fail(errors)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    command, *rest = sys.argv[1:]
    commands = {
        "visibility": check_visibility,
        "raw-urls": check_raw_urls,
        "templates": lambda: check_templates(rest[0] if rest else REPO),
        "labels": check_labels,
        "round-trip": check_round_trip,
    }
    if command not in commands:
        print(f"unknown check: {command}\n{__doc__}", file=sys.stderr)
        return 2
    return commands[command]()


if __name__ == "__main__":
    sys.exit(main())
