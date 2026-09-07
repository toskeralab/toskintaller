const BASE = "";

async function call<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path}: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  scan(dir: string) {
    return call<{ files: string[]; entry: string | null; exists: boolean }>(
      `/api/scan?dir=${encodeURIComponent(dir)}`,
    );
  },
  manifest(path: string) {
    return call<Record<string, unknown>>(`/api/manifest?path=${encodeURIComponent(path)}`);
  },
  saveManifest(path: string, data: Record<string, unknown>) {
    return call<{ ok: boolean }>(`/api/manifest`, {
      method: "POST",
      body: JSON.stringify({ path, data }),
    });
  },
  preview(manifest: Record<string, unknown>) {
    return call<{ nsi: string; bannerPng: string | null }>(`/api/preview`, {
      method: "POST",
      body: JSON.stringify(manifest),
    });
  },
  build(manifest: Record<string, unknown>) {
    return call<{ ok: boolean; artifactPath: string; hash: string }>(`/api/build`, {
      method: "POST",
      body: JSON.stringify(manifest),
    });
  },
};
