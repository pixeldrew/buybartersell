import type { AdminSettings, AdminStats } from './types';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed with HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getStats(): Promise<AdminStats> {
  return requestJson<AdminStats>('/admin/stats');
}

export function getSettings(): Promise<AdminSettings> {
  return requestJson<AdminSettings>('/admin/settings');
}

export function setTermsGate(enabled: boolean): Promise<Pick<AdminSettings, 'termsGateEnabled'>> {
  return requestJson<Pick<AdminSettings, 'termsGateEnabled'>>('/admin/settings/terms-gate', {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

export function setAppUrl(appUrl: string): Promise<Pick<AdminSettings, 'appUrl'>> {
  return requestJson<Pick<AdminSettings, 'appUrl'>>('/admin/settings/app-url', {
    method: 'POST',
    body: JSON.stringify({ appUrl }),
  });
}
