const REPO_URL = "https://github.com/idq-org/docmost";
const FALLBACK_BRANCH = "idq";

// The commit is injected at build time and ends up in a URL: accept only a hex SHA.
const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/i;

function resolveRef(commit?: string | null): string {
  return commit && COMMIT_PATTERN.test(commit) ? commit : FALLBACK_BRANCH;
}

export function buildSourceUrl(commit?: string | null): string {
  return `${REPO_URL}/tree/${resolveRef(commit)}`;
}

export function buildLicenseUrl(commit?: string | null): string {
  return `${REPO_URL}/blob/${resolveRef(commit)}/LICENSE`;
}
