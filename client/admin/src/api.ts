import type { AdminSettings, AdminStats, TrackedGroupUsers } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isAuthenticationRequiredError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new ApiError(body?.error ?? `Request failed with HTTP ${response.status}`, response.status);
  }

  return response.json() as Promise<T>;
}

export function getStats(): Promise<AdminStats> {
  return requestJson<AdminStats>('/api/admin/stats');
}

export function getSettings(): Promise<AdminSettings> {
  return requestJson<AdminSettings>('/api/admin/settings');
}

export function getTrackedGroupUsers(): Promise<{ trackedGroup: TrackedGroupUsers }> {
  return requestJson<{ trackedGroup: TrackedGroupUsers }>('/api/admin/tracked-group/users');
}

export function setTermsGate(enabled: boolean): Promise<Pick<AdminSettings, 'termsGateEnabled'>> {
  return requestJson<Pick<AdminSettings, 'termsGateEnabled'>>('/api/admin/settings/terms-gate', {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

export function setAppUrl(appUrl: string): Promise<Pick<AdminSettings, 'appUrl'>> {
  return requestJson<Pick<AdminSettings, 'appUrl'>>('/api/admin/settings/app-url', {
    method: 'POST',
    body: JSON.stringify({ appUrl }),
  });
}
