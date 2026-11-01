const REPO_TREE_URL = "https://github.com/idq-org/docmost/tree";
const FALLBACK_BRANCH = "idq";

// The commit is injected at build time and ends up in a URL: accept only a hex SHA.
const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/i;

export function buildSourceUrl(commit?: string | null): string {
  if (commit && COMMIT_PATTERN.test(commit)) {
    return `${REPO_TREE_URL}/${commit}`;
  }
  return `${REPO_TREE_URL}/${FALLBACK_BRANCH}`;
}
