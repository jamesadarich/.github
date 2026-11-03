# AGENTS.md

This repo holds the default issue forms, PR template and labels for every repo
owned by jamesadarich. See the [README](README.md) for how it works.

## Issues and pull requests

Issue and PR templates for this repo live in https://github.com/jamesadarich/.github.
Before creating an issue or opening a PR, fetch and follow:

- Parsing contract: https://raw.githubusercontent.com/jamesadarich/.github/main/docs/parsing-contract.md
- The matching template from .github/ISSUE_TEMPLATE/ or pull_request_template.md in that repo

Use the exact headings, apply the template's labels, and set "Filed by" to Agent, and add the filed-by-agent label.
If you cannot fetch these files, stop and say so rather than guessing the format.

## Working in this repo

- In this repo the templates are also local files, under `.github/`, and
  `docs/parsing-contract.md` is next to them. Read them directly.
- A form field's `label` is its rendered `### Heading`, so labels are an API.
  Don't rename, remove or reorder one unless the issue asks for it; it is a
  breaking change for every agent and service that parses issues.
- A form change usually touches three places: the form, `labels.yml`, and
  `docs/parsing-contract.md`. The contract check fails if they disagree.
- The "Issues and pull requests" section above is the snippet the README tells
  consumer repos to paste. Keep it word for word the same as the README's copy;
  a unit test checks this.

Before opening a PR, run:

```sh
npm ci
npm test
npm run check
pip install check-jsonschema
check-jsonschema --builtin-schema vendor.github-issue-forms .github/ISSUE_TEMPLATE/[0-9]*.yml
check-jsonschema --builtin-schema vendor.github-issue-config .github/ISSUE_TEMPLATE/config.yml
check-jsonschema --builtin-schema vendor.dependabot .github/dependabot.yml
shellcheck scripts/sync-labels.sh
```
