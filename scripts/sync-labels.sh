#!/usr/bin/env bash
# Sync the labels in labels.yml to one or more repos.
#
# Usage:
#   scripts/sync-labels.sh [owner/repo ...]
#
# With no arguments, syncs every non-archived repo the account owns.
# The <owner>/.github repo is always included. Labels are created or
# updated (gh label create --force); labels are never deleted. Labels
# that already match are left alone, so a second run changes nothing.
#
# Requires: gh (authenticated). Set OWNER to override the account.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
manifest="${script_dir}/../labels.yml"

owner="${OWNER:-$(gh api user --jq .login)}"

# Parse labels.yml into parallel arrays. The manifest is a flat list of
# {name, color, description} entries, one key per line.
names=() colors=() descriptions=()
while IFS= read -r line; do
  line="${line%%#*}"
  [[ "$line" =~ ^[[:space:]]*-?[[:space:]]*(name|color|description):[[:space:]]*(.*[^[:space:]])[[:space:]]*$ ]] || continue
  key="${BASH_REMATCH[1]}"
  value="${BASH_REMATCH[2]}"
  value="${value#\"}"; value="${value%\"}"
  case "$key" in
    name) names+=("$value") ;;
    color) colors+=("$value") ;;
    description) descriptions+=("$value") ;;
  esac
done < "$manifest"

if [[ ${#names[@]} -eq 0 || ${#names[@]} -ne ${#colors[@]} || ${#names[@]} -ne ${#descriptions[@]} ]]; then
  echo "error: could not parse ${manifest}" >&2
  exit 1
fi

repos=()
if [[ $# -gt 0 ]]; then
  repos=("$@")
else
  while IFS= read -r repo; do
    repos+=("$repo")
  done < <(gh repo list "$owner" --no-archived --limit 1000 --json nameWithOwner --jq '.[].nameWithOwner')
fi
repos+=("${owner}/.github")

# De-duplicate while keeping order.
declare -A seen=()
unique=()
for repo in "${repos[@]}"; do
  [[ -n "${seen[$repo]:-}" ]] && continue
  seen[$repo]=1
  unique+=("$repo")
done

for repo in "${unique[@]}"; do
  existing="$(gh label list --repo "$repo" --limit 1000 \
    --json name,color,description \
    --jq '.[] | "\(.name)\t\(.color | ascii_downcase)\t\(.description)"')"
  changed=0
  for i in "${!names[@]}"; do
    want="${names[$i]}"$'\t'"${colors[$i],,}"$'\t'"${descriptions[$i]}"
    if ! grep -Fxq -- "$want" <<<"$existing"; then
      gh label create "${names[$i]}" --repo "$repo" \
        --color "${colors[$i]}" --description "${descriptions[$i]}" --force >/dev/null
      changed=$((changed + 1))
    fi
  done
  echo "${repo}: ${changed} label(s) created or updated"
done
