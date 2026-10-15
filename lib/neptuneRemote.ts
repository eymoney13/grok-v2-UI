/**
 * Read project-neptune-v2 main without cloning it.
 *
 * `raw.githubusercontent.com` is tried first. A 404 there is retried against
 * the GitHub contents API. A token, when one is available, is sent on both.
 * This module does not write files and does not push anywhere.
 */

export const NEPTUNE_V2_REPO = "eymoney13/project-neptune-v2";
export const NEPTUNE_V2_REF = "main";

/** Files the board needs from that repo. Roster and current.csv are required. */
export const NEPTUNE_V2_REMOTE_FILES = [
  "outputs/daily/current.csv",
  "outputs/run_manifest.json",
  "data/roster.json",
  "config/neptune_index_bands.json",
  "config/calibration_ceilings.json",
  "config/staleness_thresholds.json",
] as const;

export const NEPTUNE_V2_REQUIRED_FILES = [
  "outputs/daily/current.csv",
  "data/roster.json",
] as const;

export type RemoteMethod = "raw" | "api";

export interface RemoteFileError {
  method: RemoteMethod;
  url: string;
  status: number | null;
  body: string;
}

export interface RemoteAttempt {
  ok: boolean;
  method: RemoteMethod | null;
  files: Record<string, string>;
  errors: RemoteFileError[];
}

export function rawGithubUrl(file: string, ref = NEPTUNE_V2_REF): string {
  return `https://raw.githubusercontent.com/${NEPTUNE_V2_REPO}/${ref}/${file}`;
}

export function githubContentsUrl(file: string, ref = NEPTUNE_V2_REF): string {
  return `https://api.github.com/repos/${NEPTUNE_V2_REPO}/contents/${file}?ref=${encodeURIComponent(ref)}`;
}

function clip(body: string): string {
  const text = body.replace(/\s+/g, " ").trim();
  return text.length > 280 ? `${text.slice(0, 280)}…` : text;
}

async function pullFile(
  url: string,
  method: RemoteMethod,
  token: string | null,
  fetchImpl: typeof fetch
): Promise<{ text: string | null; error: RemoteFileError | null }> {
  const headers: Record<string, string> = { Accept: method === "api" ? "application/vnd.github.raw" : "text/plain" };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetchImpl(url, { headers });
    const body = await response.text();
    if (!response.ok) {
      return { text: null, error: { method, url, status: response.status, body: clip(body) } };
    }
    return { text: body, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { text: null, error: { method, url, status: null, body: clip(message) } };
  }
}

/**
 * Download the v2 files. `token` is sent when provided. Tests pass `fetchImpl`
 * and skip any local token discovery.
 */
export async function fetchNeptuneV2Snapshot(options?: {
  token?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<RemoteAttempt> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const token = options?.token ?? null;
  const errors: RemoteFileError[] = [];
  const probe = NEPTUNE_V2_REQUIRED_FILES[0];

  for (const method of ["raw", "api"] as const) {
    const probeUrl = method === "raw" ? rawGithubUrl(probe) : githubContentsUrl(probe);
    const first = await pullFile(probeUrl, method, token, fetchImpl);
    if (first.error || first.text == null) {
      if (first.error) errors.push(first.error);
      continue;
    }
    const files: Record<string, string> = { [probe]: first.text };
    let requiredOk = true;
    for (const file of NEPTUNE_V2_REMOTE_FILES) {
      if (file === probe) continue;
      const url = method === "raw" ? rawGithubUrl(file) : githubContentsUrl(file);
      const result = await pullFile(url, method, token, fetchImpl);
      if (result.error || result.text == null) {
        if (result.error) errors.push(result.error);
        if ((NEPTUNE_V2_REQUIRED_FILES as readonly string[]).includes(file)) requiredOk = false;
        continue;
      }
      files[file] = result.text;
    }
    if (requiredOk && NEPTUNE_V2_REQUIRED_FILES.every((file) => files[file] != null)) {
      return { ok: true, method, files, errors };
    }
  }
  return { ok: false, method: null, files: {}, errors };
}

export function formatRemoteErrors(attempt: RemoteAttempt): string {
  if (attempt.errors.length === 0) return "no response body";
  return attempt.errors
    .map((error) => {
      const status = error.status == null ? "network error" : `HTTP ${error.status}`;
      return `${error.method} ${error.url} → ${status}: ${error.body}`;
    })
    .join("; ");
}
