# .github

Default issue forms, template chooser and pull request template for every repo
owned by [jamesadarich](https://github.com/jamesadarich). GitHub uses the files
here for any repo on the account that doesn't define its own, so templates are
edited in one place and no consumer repo holds a copy.

> **This repo must stay public.** GitHub ignores defaults stored in a private
> `.github` repo. Nothing secret goes in it.

## What's here

| Path | Purpose |
| --- | --- |
| `.github/ISSUE_TEMPLATE/1-bug.yml` | Bug report form |
| `.github/ISSUE_TEMPLATE/2-feature.yml` | Feature request form |
| `.github/ISSUE_TEMPLATE/3-task.yml` | Task form: a unit of work ready for a coding agent |
| `.github/ISSUE_TEMPLATE/config.yml` | Template chooser: blank issues off, no contact links |
| `.github/pull_request_template.md` | Default PR template |
| `.github/workflows/validate.yml` | CI that validates the templates |
| `.github/workflows/live.yml` | CI that checks the published repo on GitHub |
| `labels.yml` | Label manifest used by the forms |
| `scripts/sync-labels.sh` | Pushes `labels.yml` to consumer repos |
| `scripts/check-contract.mjs` | Checks that forms, labels and the parsing contract agree |
| `scripts/check-live.mjs` | Live checks against the published repo, run by `live.yml` |
| `scripts/lib.mjs` | Shared helpers: loads the forms and labels, builds and parses issue bodies |
| `test/` | Unit tests for the checks (`npm test`) |
| `AGENTS.md` | Instructions for agents working in this repo, including the snippet below |
| `package.json` | Node 22+, with one dependency (`yaml`) |
| `docs/parsing-contract.md` | The heading contract agents and services follow |

## How consumer repos use this

There is nothing to install. Any repo on the account with no template files of
its own picks these up automatically: the chooser shows Bug, Feature and Task in
that order, and new PRs start from the PR template. Blank issues are switched
off, so issues come in through a form (maintainers still see a "Blank issue"
option).

**If a consumer repo has even one file in its own `.github/ISSUE_TEMPLATE/`
folder, GitHub ignores this repo's whole `ISSUE_TEMPLATE` folder for that
repo.** The same goes for the PR template: a repo with its own
`pull_request_template.md` uses that one instead. Delete the repo's own files to
go back to the defaults.

Repos that have their own `ISSUE_TEMPLATE` folder, and so don't use these
defaults, are listed below. They are left unchanged.

<!-- Keep this list up to date. Find them with:
     for r in $(gh repo list jamesadarich --no-archived --json nameWithOwner --jq '.[].nameWithOwner'); do
       gh api "repos/$r/contents/.github/ISSUE_TEMPLATE" --silent 2>/dev/null && echo "$r"
     done -->
- None recorded yet.

### Labels

A form only applies a label that already exists in the target repo; otherwise
the label is silently dropped. Run the sync script after creating a repo, or
after changing `labels.yml`:

```sh
scripts/sync-labels.sh                          # every non-archived repo on the account
scripts/sync-labels.sh jamesadarich/some-repo   # just the repos named
```

It needs an authenticated `gh`. It creates or updates each label in
`labels.yml` with `gh label create --force`, never deletes labels, always
includes this repo, and prints one line per repo with the number of labels it
created or updated. Labels that already match are skipped, so a second run
changes nothing.

## For agents

Agents don't see these defaults in a local checkout, and an issue created
through the API or `gh` skips the form entirely. So the format is written down
in [`docs/parsing-contract.md`](docs/parsing-contract.md): every issue body is a
fixed sequence of `### Heading` sections, and every PR body a fixed sequence of
`##` sections.

Raw URLs (agents fetch from `main`; file names don't change once published):

- https://raw.githubusercontent.com/jamesadarich/.github/main/.github/ISSUE_TEMPLATE/1-bug.yml
- https://raw.githubusercontent.com/jamesadarich/.github/main/.github/ISSUE_TEMPLATE/2-feature.yml
- https://raw.githubusercontent.com/jamesadarich/.github/main/.github/ISSUE_TEMPLATE/3-task.yml
- https://raw.githubusercontent.com/jamesadarich/.github/main/.github/pull_request_template.md
- https://raw.githubusercontent.com/jamesadarich/.github/main/docs/parsing-contract.md

### AGENTS.md snippet

GitHub doesn't inherit `AGENTS.md` from this repo. Paste this into each consumer
repo's `AGENTS.md` by hand. This repo's own [`AGENTS.md`](AGENTS.md) carries the
same text, and a unit test keeps the two copies identical.

Claude Code v2.1.277 and later reads `AGENTS.md` directly, as long as the repo
has no `CLAUDE.md` or `CLAUDE.local.md`. If a repo does have a `CLAUDE.md`, or
uses an older Claude Code, add the line `@AGENTS.md` to that `CLAUDE.md` so it
imports the same instructions. See
[Claude Code's memory docs](https://code.claude.com/docs/en/memory#agents-md).

```markdown
## Issues and pull requests

Issue and PR templates for this repo live in https://github.com/jamesadarich/.github.
Before creating an issue or opening a PR, fetch and follow:

- Parsing contract: https://raw.githubusercontent.com/jamesadarich/.github/main/docs/parsing-contract.md
- The matching template from .github/ISSUE_TEMPLATE/ or pull_request_template.md in that repo

Use the exact headings, apply the template's labels, and set "Filed by" to Agent, and add the filed-by-agent label.
If you cannot fetch these files, stop and say so rather than guessing the format.
```

## Changing the templates

A field's label becomes its rendered `### Heading`, so labels are an API:
renaming, removing or reordering one breaks every agent and service that parses
issues.

### Adding a new form

1. Add `.github/ISSUE_TEMPLATE/<n>-<name>.yml`. The number prefix sets its place
   in the chooser.
2. Open it with a `type: markdown` block of at most two sentences saying what
   makes a good report. Add no other prose.
3. Give every input a kebab-case `id`. Keep required fields few, use dropdowns
   for closed sets of values, `render: shell` for logs and commands, and a
   `- [ ]` placeholder for acceptance criteria.
4. End with the shared `source` dropdown labelled `Filed by` (`Human`, `Agent`,
   `App or service`).
5. Don't use a `type:` key: issue types are only available to organisations.
6. Add any new labels to `labels.yml` and run `scripts/sync-labels.sh`.
7. Add a section for the form to `docs/parsing-contract.md`, and its raw URL to
   the list above.
8. Open a PR. CI fails if the form is invalid, uses a label not in
   `labels.yml`, lacks the `Filed by` dropdown, or has a field label missing
   from the contract.

## Validation

`.github/workflows/validate.yml` runs on every push and pull request to `main`.
A broken form doesn't fail loudly (GitHub just leaves it out of the chooser), so
these checks gate the merge:

1. **Schema.** `check-jsonschema` against GitHub's issue-form and issue-config
   schemas.
2. **Contract.** `npm test`, then `scripts/check-contract.mjs`: unique ids, a `Filed by` dropdown
   in every form, every form label in `labels.yml`, and every field label
   documented in `docs/parsing-contract.md`.
3. **Lint.** `actionlint` on the workflow and `shellcheck` on `sync-labels.sh`.

Branch protection on `main` requires these jobs to pass.

### Live checks

`.github/workflows/live.yml` checks the published repo on GitHub itself, using
`scripts/check-live.mjs`. It runs after every push to `main`, weekly, and on
demand from the Actions tab. It fails if:

- the repo isn't public;
- any raw URL above doesn't return `text/plain`;
- a second run of `scripts/sync-labels.sh` changes anything, or the repo's
  labels don't match `labels.yml`.

Run it by hand with **file-test-issues** ticked to file one issue per form with
`gh issue create --body`, the way an agent would. The workflow reads each issue
back, checks its headings, "Filed by" value and labels against the contract,
then closes it as not planned.

GitHub has no API that reliably lists issue forms: the GraphQL
`issueTemplates` field returned none of this repo's forms. So the schema check
in `validate.yml` is the guard against a broken form, and these stay manual:
seeing Bug, Feature and Task in a consumer repo's chooser, the blank-issue
option, and the agent-session test.

To run the checks locally:

```sh
pip install check-jsonschema
npm ci
check-jsonschema --builtin-schema vendor.github-issue-forms .github/ISSUE_TEMPLATE/[0-9]*.yml
check-jsonschema --builtin-schema vendor.github-issue-config .github/ISSUE_TEMPLATE/config.yml
npm test
npm run check
shellcheck scripts/sync-labels.sh
```
