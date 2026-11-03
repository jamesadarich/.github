#!/usr/bin/env bash
# Check the published .github repo on live GitHub.
#
# These checks cover what validate.yml can't see from a checkout. Each one
# is a subcommand, so the workflow reports them as separate steps:
#
#   visibility        the repo is public
#   raw-urls          every raw URL in the README returns 200 as text/plain
#   templates [REPO]  GitHub reports every form as an issue template for REPO
#   labels            the repo's labels include labels.yml exactly
#   round-trip        file one issue per form outside the form (as an agent
#                     would), read it back, check it against the contract,
#                     then close it
#
# Requires: gh (authenticated), jq, curl, and yq (either the Go or the
# Python one). The repo comes from GITHUB_REPOSITORY.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
forms_dir="${root}/.github/ISSUE_TEMPLATE"
repo="${GITHUB_REPOSITORY:-jamesadarich/.github}"
errors=0

error() {
  echo "error: $*" >&2
  errors=$((errors + 1))
}

# Print a YAML file as JSON, with whichever yq is installed.
to_json() {
  if yq --version 2>&1 | grep -q mikefarah; then
    yq -o=json '.' "$1"
  else
    yq '.' "$1"
  fi
}

forms() {
  find "$forms_dir" -name '*.yml' ! -name config.yml | sort
}

check_visibility() {
  local visibility
  visibility="$(gh api "repos/${repo}" --jq .visibility)"
  echo "${repo} visibility: ${visibility}"
  [[ "$visibility" == public ]] ||
    error "${repo} must be public; GitHub ignores defaults in a private .github repo"
}

check_raw_urls() {
  local urls url result
  urls="$(grep -o 'https://raw\.githubusercontent\.com/[^[:space:])`]*' "${root}/README.md" | sort -u)"
  [[ -n "$urls" ]] || error "README lists no raw URLs"
  while IFS= read -r url; do
    [[ -n "$url" ]] || continue
    result="$(curl -sS -o /dev/null -w '%{http_code} %{content_type}' "$url" || echo "000 fetch-failed")"
    echo "${result} ${url}"
    [[ "$result" == "200 text/plain"* ]] ||
      error "${url}: expected 200 text/plain, got ${result}"
  done <<<"$urls"
}

check_templates() {
  local target="${1:-$repo}" reported form name
  # shellcheck disable=SC2016 # $owner and $name are GraphQL variables
  reported="$(gh api graphql \
    -f query='query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { issueTemplates { name } } }' \
    -f owner="${target%%/*}" -f name="${target#*/}" \
    --jq '.data.repository.issueTemplates[]?.name')"
  echo "${target} issue templates:"
  echo "  ${reported//$'\n'/$'\n  '}"
  while IFS= read -r form; do
    name="$(to_json "$form" | jq -r .name)"
    grep -Fxq -- "$name" <<<"$reported" ||
      error "${target}: GitHub does not report '${name}'. The form may be invalid, or the repo has its own ISSUE_TEMPLATE folder."
  done < <(forms)
}

check_labels() {
  local want have line
  want="$(to_json "${root}/labels.yml" |
    jq -r '.[] | "\(.name)\t\(.color | tostring | ascii_downcase)\t\(.description)"')"
  have="$(gh label list --repo "$repo" --limit 1000 --json name,color,description \
    --jq '.[] | "\(.name)\t\(.color | ascii_downcase)\t\(.description)"')"
  while IFS= read -r line; do
    grep -Fxq -- "$line" <<<"$have" ||
      error "label does not match labels.yml: $(tr '\t' ' ' <<<"$line")"
  done <<<"$want"
  [[ $errors -gt 0 ]] || echo "${repo}: all $(wc -l <<<"$want") labels match labels.yml"
}

# jq program: the issue body an agent would write for a form, following the
# parsing contract.
# shellcheck disable=SC2016 # jq, not shell, expands these
body_program='
  def sample:
    if (.validations.required // false) | not then "_No response_"
    elif .type == "dropdown" then (if .id == "source" then "Agent" else .attributes.options[0] end)
    elif .id == "acceptance" then "- [ ] Live check passes"
    elif .attributes.render then "```\(.attributes.render)\necho live check\n```"
    else "Filed by the live check."
    end;
  [.body[] | select(.type != "markdown") | "### \(.attributes.label)\n\n\(sample)"]
  | join("\n\n")'

check_round_trip() {
  local form json file url issue body headings expected filed_by label applied
  while IFS= read -r form; do
    file="$(basename "$form")"
    json="$(to_json "$form")"
    body="$(jq -r "$body_program" <<<"$json")"
    local args=(--repo "$repo" --body-file - --title "$(jq -r '.title // ""' <<<"$json")Live check (${file})")
    while IFS= read -r label; do
      args+=(--label "$label")
    done < <(jq -r '(.labels // [])[]' <<<"$json"; echo filed-by-agent)
    url="$(gh issue create "${args[@]}" <<<"$body" | tail -n 1)"
    echo "${file}: filed ${url}"

    issue="$(gh issue view "$url" --json body,labels)"
    body="$(jq -r .body <<<"$issue" | tr -d '\r')"
    headings="$(sed -n 's/^### //p' <<<"$body")"
    expected="$(jq -r '.body[] | select(.type != "markdown") | .attributes.label' <<<"$json")"
    [[ "$headings" == "$expected" ]] ||
      error "${file}: headings [$(paste -sd, <<<"$headings")] != contract [$(paste -sd, <<<"$expected")]"

    filed_by="$(awk '/^### /{in_section = ($0 == "### Filed by"); next} in_section && NF {print; exit}' <<<"$body")"
    [[ "$filed_by" == Agent ]] || error "${file}: 'Filed by' is '${filed_by}', expected 'Agent'"

    applied="$(jq -r '.labels[].name' <<<"$issue")"
    while IFS= read -r label; do
      grep -Fxq -- "$label" <<<"$applied" || error "${file}: label '${label}' not applied"
    done < <(jq -r '(.labels // [])[]' <<<"$json"; echo filed-by-agent)

    gh issue close "$url" --reason "not planned" \
      --comment "Closed automatically by the live check." >/dev/null
  done < <(forms)
}

usage() {
  sed -n '2,/^set -euo/{/^set -euo/d;s/^# \{0,1\}//;p}' "${BASH_SOURCE[0]}" >&2
  exit 2
}

case "${1:-}" in
  visibility) check_visibility ;;
  raw-urls) check_raw_urls ;;
  templates) check_templates "${2:-}" ;;
  labels) check_labels ;;
  round-trip) check_round_trip ;;
  *) usage ;;
esac

[[ $errors -eq 0 ]]
