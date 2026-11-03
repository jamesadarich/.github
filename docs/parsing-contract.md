# Parsing contract

This is the contract for issue and pull request bodies in every repo owned by
[jamesadarich](https://github.com/jamesadarich). It applies to people using the
web forms, and to agents, `gh issue create --body`, the issue-reporting service,
or anything else that creates issues and PRs without the form.

Field labels are an API. Renaming, removing or reordering one is a breaking
change.

## Rules

1. An issue body is a sequence of `### <Label>` sections, in the order the form
   defines.
2. Labels match the tables below exactly, including case.
3. An empty optional field renders as `_No response_`. Readers treat that as
   empty, and writers use the same string.
4. A dropdown renders as its option text on its own line.
5. Anyone creating an issue outside the web form (an agent,
   `gh issue create --body`, the issue-reporting service) must produce the same
   headings in the same order, and must apply the form's labels.
6. PR bodies follow the `##` headings of the PR template, the same way.

Agents that file an issue also apply the `filed-by-agent` label and set
"Filed by" to `Agent`. Forms do not add that label.

## Bug report

Template: `.github/ISSUE_TEMPLATE/1-bug.yml` · Title prefix: `[Bug]: ` ·
Labels: `bug`, `needs-triage`

| Heading | id | Kind | Required |
| --- | --- | --- | --- |
| `### Summary` | `summary` | text | yes |
| `### Steps to reproduce` | `steps` | text | yes |
| `### Expected behaviour` | `expected` | text | yes |
| `### Actual behaviour` | `actual` | text | yes |
| `### Severity` | `severity` | one of: `Blocker`, `Major`, `Minor`, `Cosmetic` | yes |
| `### Environment` | `environment` | text (version, OS, device) | no |
| `### Logs` | `logs` | ` ```shell ` code block | no |
| `### Filed by` | `source` | one of: `Human`, `Agent`, `App or service` | yes |

## Feature request

Template: `.github/ISSUE_TEMPLATE/2-feature.yml` · Title prefix: `[Feature]: ` ·
Labels: `enhancement`, `needs-triage`

| Heading | id | Kind | Required |
| --- | --- | --- | --- |
| `### Problem` | `problem` | text | yes |
| `### Proposed solution` | `proposal` | text | yes |
| `### Alternatives considered` | `alternatives` | text | no |
| `### Acceptance criteria` | `acceptance` | `- [ ]` task list | yes |
| `### Priority` | `priority` | one of: `High`, `Medium`, `Low` | no |
| `### Filed by` | `source` | one of: `Human`, `Agent`, `App or service` | yes |

## Task

Template: `.github/ISSUE_TEMPLATE/3-task.yml` · Title prefix: `[Task]: ` ·
Labels: `task`

| Heading | id | Kind | Required |
| --- | --- | --- | --- |
| `### Goal` | `goal` | text (one or two sentences) | yes |
| `### Context` | `context` | text (links, related issues, background) | no |
| `### Acceptance criteria` | `acceptance` | `- [ ]` task list | yes |
| `### Files or areas in scope` | `scope` | text | no |
| `### Out of scope` | `out-of-scope` | text | no |
| `### How to verify` | `verification` | ` ```shell ` code block (commands to run) | yes |
| `### Filed by` | `source` | one of: `Human`, `Agent`, `App or service` | yes |

## Example: a task filed by an agent

```sh
gh issue create --repo jamesadarich/example \
  --title "[Task]: Add retry to the upload client" \
  --label task --label filed-by-agent \
  --body-file - <<'BODY'
### Goal

Retry failed uploads up to three times with backoff.

### Context

_No response_

### Acceptance criteria

- [ ] Transient 5xx errors are retried up to three times
- [ ] Non-retryable errors fail immediately

### Files or areas in scope

src/upload/

### Out of scope

_No response_

### How to verify

```shell
npm test -- upload
```

### Filed by

Agent
BODY
```

## Pull requests

Template: `.github/pull_request_template.md`. A PR body has these `##`
sections, in this order. Write `None` for a section that does not apply.

1. `## Summary`
2. `## Linked issue`
3. `## Changes`
4. `## How verified`
5. `## Risks and follow-ups`
6. `## Authored by` (`Human`, `Agent`, or `Human + agent`)
