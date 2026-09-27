#!/usr/bin/env bash
# Merge only a same-repository, evidence-review PR whose hosting preview passed.
set -euo pipefail

PR_URL="${1:?pull-request URL required}"
TIMEOUT_SECONDS="${2:-600}"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
REQUIRED_CHECK="${REQUIRED_HOSTING_CHECK:-Workers Builds: noveraai}"
BRANCH_PREFIX="automation/editorial-"
TITLE_PREFIX="[Automated] Evidence-reviewed AI tools —"

info="$(gh pr view "$PR_URL" --repo "$REPO" --json number,url,title,state,isDraft,baseRefName,headRefName,headRefOid,mergeable,mergeStateStatus)"
number="$(jq -r '.number' <<<"$info")"
state="$(jq -r '.state' <<<"$info")"
draft="$(jq -r '.isDraft' <<<"$info")"
base="$(jq -r '.baseRefName' <<<"$info")"
branch="$(jq -r '.headRefName' <<<"$info")"
sha="$(jq -r '.headRefOid' <<<"$info")"
title="$(jq -r '.title' <<<"$info")"

if [[ "$state" != "OPEN" || "$draft" != "false" || "$base" != "main" || "$branch" != "$BRANCH_PREFIX"* || "$title" != "$TITLE_PREFIX"* ]]; then
  echo "Refusing to merge an unexpected pull request: $info" >&2
  exit 1
fi

mapfile -t files < <(gh pr diff "$PR_URL" --repo "$REPO" --name-only)
if (( ${#files[@]} == 0 || ${#files[@]} > 250 )); then
  echo "Refusing unexpected changed-file count: ${#files[@]}" >&2
  exit 1
fi
for path in "${files[@]}"; do
  case "$path" in
    all-tools/index.html|assets/auto-data.js|assets/posts-data.js|categories/*/index.html|categories/index.html|data/auto-tools.json|data/posts.json|data/editorial-queue.json|data/editorial-log.jsonl|feed.xml|guides/*/index.html|guides/index.html|index.html|new/index.html|sitemap.xml|tools/*/index.html)
      ;;
    *)
      echo "Refusing unexpected path in automated PR: $path" >&2
      exit 1
      ;;
  esac
done

start="$(date +%s)"
while true; do
  checks="$(gh api -H 'Accept: application/vnd.github+json' "/repos/$REPO/commits/$sha/check-runs?per_page=100")"
  count="$(jq --arg name "$REQUIRED_CHECK" '[.check_runs[] | select(.name == $name)] | length' <<<"$checks")"
  success="$(jq --arg name "$REQUIRED_CHECK" '[.check_runs[] | select(.name == $name and .status == "completed" and .conclusion == "success")] | length' <<<"$checks")"
  failed="$(jq --arg name "$REQUIRED_CHECK" '[.check_runs[] | select(.name == $name and .status == "completed" and .conclusion != "success")] | length' <<<"$checks")"
  if (( failed > 0 )); then
    gh pr comment "$PR_URL" --repo "$REPO" --body "Automatic merge stopped: required hosting check **$REQUIRED_CHECK** failed. The PR remains open and unpublished."
    exit 1
  fi
  if (( count > 0 && success == count )); then
    echo "Required hosting check passed for $sha."
    break
  fi
  if (( $(date +%s) - start >= TIMEOUT_SECONDS )); then
    gh pr comment "$PR_URL" --repo "$REPO" --body "Automatic merge paused: required hosting check **$REQUIRED_CHECK** did not complete within ${TIMEOUT_SECONDS} seconds. A later scheduled run can retry; nothing was published."
    exit 1
  fi
  sleep 15
done

for _ in $(seq 1 20); do
  info="$(gh pr view "$PR_URL" --repo "$REPO" --json state,mergeable,mergeStateStatus,headRefOid)"
  current_sha="$(jq -r '.headRefOid' <<<"$info")"
  mergeable="$(jq -r '.mergeable' <<<"$info")"
  merge_state="$(jq -r '.mergeStateStatus' <<<"$info")"
  if [[ "$current_sha" != "$sha" ]]; then
    echo "PR head changed during verification; refusing merge." >&2
    exit 1
  fi
  if [[ "$mergeable" == "CONFLICTING" || "$merge_state" == "DIRTY" ]]; then
    gh pr comment "$PR_URL" --repo "$REPO" --body "Automatic merge stopped because the branch conflicts with main. Nothing was published."
    exit 1
  fi
  if [[ "$mergeable" == "MERGEABLE" && "$merge_state" == "CLEAN" ]]; then
    break
  fi
  sleep 6
done
if [[ "$mergeable" != "MERGEABLE" || "$merge_state" != "CLEAN" ]]; then
  gh pr comment "$PR_URL" --repo "$REPO" --body "Automatic merge paused because GitHub did not report a clean merge state. Nothing was published."
  exit 1
fi

gh pr comment "$PR_URL" --repo "$REPO" --body "Strict deterministic evidence review, publication-gate audit, path allowlist, and **$REQUIRED_CHECK** all passed. Merging automatically."
gh pr merge "$PR_URL" --repo "$REPO" --merge --delete-branch
