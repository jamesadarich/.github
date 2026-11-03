#!/usr/bin/env node
// Check the published .github repo on live GitHub: what validate.yml can't
// see from a checkout. Each check is a subcommand, so the workflow reports
// them as separate steps:
//
//   visibility        the repo is public
//   raw-urls          every raw URL in the README returns 200 as text/plain
//   templates [REPO]  GitHub reports every form as an issue template for REPO
//   labels            the repo's labels include labels.yml exactly
//   round-trip        file one issue per form outside the form (as an agent
//                     would), read it back, check it against the contract,
//                     then close it
//
// Needs an authenticated `gh`. The repo comes from GITHUB_REPOSITORY.
import { execFileSync } from "node:child_process";
import { buildBody, fieldsOf, loadForms, loadLabels, parseSections, readText } from "./lib.mjs";

const REPO = process.env.GITHUB_REPOSITORY ?? "jamesadarich/.github";
const AGENT_LABEL = "filed-by-agent";

const gh = (args, input) => execFileSync("gh", args, { encoding: "utf8", input }).trim();
const ghJson = (args) => JSON.parse(gh(args));

async function visibility() {
  const value = ghJson(["api", `repos/${REPO}`]).visibility;
  console.log(`${REPO} visibility: ${value}`);
  return value === "public" ? [] : [`${REPO} must be public; GitHub ignores defaults in a private .github repo`];
}

async function rawUrls() {
  const urls = [...new Set(readText("README.md").match(/https:\/\/raw\.githubusercontent\.com\/[^\s)`]+/g) ?? [])];
  if (!urls.length) return ["README lists no raw URLs"];
  const errors = [];
  for (const url of urls) {
    let result;
    try {
      const response = await fetch(url);
      result = `${response.status} ${response.headers.get("content-type") ?? ""}`;
    } catch (error) {
      result = `fetch failed (${error.cause?.message ?? error.message})`;
    }
    console.log(`${result} ${url}`);
    if (!result.startsWith("200 text/plain")) errors.push(`${url}: expected 200 text/plain, got ${result}`);
  }
  return errors;
}

async function templates(repo = REPO) {
  const [owner, name] = repo.split("/");
  const query = `query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) { issueTemplates { name } } }`;
  const data = ghJson(["api", "graphql", "-f", `query=${query}`, "-f", `owner=${owner}`, "-f", `name=${name}`]);
  const reported = (data.data.repository.issueTemplates ?? []).map((template) => template.name);
  console.log(`${repo} issue templates: ${reported.join(", ") || "(none)"}`);
  return loadForms()
    .map(({ form }) => form.name)
    .filter((formName) => !reported.includes(formName))
    .map((formName) => `${repo}: GitHub does not report '${formName}'. The form may be invalid, or the repo has its own ISSUE_TEMPLATE folder.`);
}

async function labels() {
  const have = new Map(
    ghJson(["label", "list", "--repo", REPO, "--limit", "1000", "--json", "name,color,description"])
      .map((label) => [label.name, `${label.color.toLowerCase()} ${label.description}`]),
  );
  const want = loadLabels();
  const errors = want
    .filter(({ name, color, description }) => have.get(name) !== `${color} ${description}`)
    .map(({ name, color, description }) => `label '${name}': expected '${color} ${description}', found '${have.get(name) ?? "missing"}'`);
  if (!errors.length) console.log(`${REPO}: all ${want.length} labels match labels.yml`);
  return errors;
}

/** Check an issue read back from GitHub against the form it was filed from. */
export function checkIssue({ file, form }, issue) {
  const errors = [];
  const sections = parseSections(issue.body);
  const headings = sections.map(([heading]) => heading);
  const expected = fieldsOf(form).map((field) => field.attributes.label);
  if (headings.join("\n") !== expected.join("\n")) {
    errors.push(`${file}: headings [${headings.join(", ")}] != contract [${expected.join(", ")}]`);
  }
  const filedBy = new Map(sections).get("Filed by");
  if (filedBy !== "Agent") errors.push(`${file}: 'Filed by' is '${filedBy}', expected 'Agent'`);
  const applied = new Set(issue.labels.map((label) => label.name));
  for (const label of [...(form.labels ?? []), AGENT_LABEL]) {
    if (!applied.has(label)) errors.push(`${file}: label '${label}' not applied`);
  }
  return errors;
}

async function roundTrip() {
  const errors = [];
  for (const entry of loadForms()) {
    const { file, form } = entry;
    const args = ["issue", "create", "--repo", REPO, "--body-file", "-", "--title", `${form.title ?? ""}Live check (${file})`];
    for (const label of [...(form.labels ?? []), AGENT_LABEL]) args.push("--label", label);
    const url = gh(args, buildBody(form)).split("\n").at(-1);
    console.log(`${file}: filed ${url}`);
    try {
      errors.push(...checkIssue(entry, ghJson(["issue", "view", url, "--json", "body,labels"])));
    } finally {
      gh(["issue", "close", url, "--reason", "not planned", "--comment", "Closed automatically by the live check."]);
    }
  }
  return errors;
}

const checks = { visibility, "raw-urls": rawUrls, templates, labels, "round-trip": roundTrip };

if (import.meta.main ?? process.argv[1] === new URL(import.meta.url).pathname) {
  const [command, ...rest] = process.argv.slice(2);
  if (!checks[command]) {
    console.error(`usage: check-live.mjs <${Object.keys(checks).join("|")}> [repo]`);
    process.exit(2);
  }
  const errors = await checks[command](...rest);
  for (const error of errors) console.error(`error: ${error}`);
  process.exit(errors.length ? 1 : 0);
}
