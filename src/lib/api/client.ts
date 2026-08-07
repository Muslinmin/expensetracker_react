/**
 * Thin fetch wrapper. Deliberately a factory rather than a module singleton:
 * base URL and bearer key both come from user settings and can change at
 * runtime, and a singleton would strand stale credentials in the closure.
 */

/** Any non-2xx from the API. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(detail);
    this.name = 'ApiError';
  }
}

/**
 * Credentials missing or wrong. Callers treat this as "rejected", not as a
 * transient failure worth retrying.
 *
 * The contract documents a bare 403 for both cases, but the running server
 * actually answers 401 `{"detail":"Not authenticated"}` when the Authorization
 * header is absent and 403 only when the key is present and wrong. Both are
 * handled, and the two are distinguished so the UI can say which happened.
 */
export class ApiAuthError extends ApiError {
  constructor(status: 401 | 403 = 403) {
    super(status, status === 401 ? 'No server key supplied' : 'Server key rejected');
    this.name = 'ApiAuthError';
  }
}

export function isAuthStatus(status: number): status is 401 | 403 {
  return status === 401 || status === 403;
}

/** Network-level failure: wrong host, backend down, cleartext blocked. */
export class ApiNetworkError extends Error {
  constructor(readonly cause: unknown) {
    super('Could not reach the server');
    this.name = 'ApiNetworkError';
  }
}

export interface Api {
  get<T>(path: string, params?: Record<string, unknown>): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  delete<T>(path: string, params?: Record<string, unknown>): Promise<T>;
  /** Multipart upload with real progress, used by POST /ingest. */
  upload<T>(path: string, file: UploadFile, onProgress?: (pct: number) => void): Promise<T>;
  readonly baseUrl: string;
}

export interface UploadFile {
  uri: string;
  name: string;
  mimeType: string;
}

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return '';
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

async function toError(res: Response): Promise<ApiError> {
  if (isAuthStatus(res.status)) return new ApiAuthError(res.status);
  // FastAPI's default error shape is {"detail": "..."} — but a 500 from a
  // proxy or a crash can be HTML, so never assume the body parses.
  let detail = `Request failed (${res.status})`;
  try {
    const body = await res.json();
    if (body && typeof body.detail === 'string') detail = body.detail;
  } catch {
    /* keep the generic message */
  }
  return new ApiError(res.status, detail);
}

export function createApi(baseUrl: string, serverKey: string): Api {
  const root = baseUrl.replace(/\/+$/, '');
  const authHeader = { Authorization: `Bearer ${serverKey}` };

  async function request<T>(path: string, init: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${root}${path}`, {
        ...init,
        headers: { ...authHeader, ...(init.headers ?? {}) },
      });
    } catch (e) {
      throw new ApiNetworkError(e);
    }
    if (!res.ok) throw await toError(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    baseUrl: root,

    get: (path, params) => request(`${path}${buildQuery(params)}`, { method: 'GET' }),

    post: (path, body) =>
      request(path, {
        method: 'POST',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),

    delete: (path, params) =>
      request(`${path}${buildQuery(params)}`, { method: 'DELETE' }),

    /**
     * `fetch` reports no upload progress in React Native, so this drops to
     * XMLHttpRequest — RN implements the upload progress events on it.
     * Note the FormData part is `{uri, name, type}`, not a File/Blob; that is
     * an RN-specific shape and passing a Blob here silently uploads nothing.
     */
    upload: (path, file, onProgress) =>
      new Promise((resolve, reject) => {
        const form = new FormData();
        form.append('file', {
          uri: file.uri,
          name: file.name,
          type: file.mimeType,
        } as unknown as Blob);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${root}${path}`);
        xhr.setRequestHeader('Authorization', `Bearer ${serverKey}`);
        // No timeout: the contract warns the first ingest after a backfill can
        // pause while the LLM categorises a large batch of new merchants.
        xhr.timeout = 0;

        if (onProgress) {
          xhr.upload.onprogress = e => {
            if (e.lengthComputable) onProgress(e.loaded / e.total);
          };
        }

        xhr.onload = () => {
          if (isAuthStatus(xhr.status)) return reject(new ApiAuthError(xhr.status));
          if (xhr.status < 200 || xhr.status >= 300) {
            let detail = `Upload failed (${xhr.status})`;
            try {
              const body = JSON.parse(xhr.responseText);
              if (typeof body?.detail === 'string') detail = body.detail;
            } catch {
              /* keep the generic message */
            }
            return reject(new ApiError(xhr.status, detail));
          }
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            reject(new ApiError(xhr.status, 'Server returned a malformed response'));
          }
        };
        xhr.onerror = () => reject(new ApiNetworkError(null));
        xhr.send(form);
      }),
  };
}
