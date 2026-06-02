import {
  createDirectJoinAudit,
  markDirectJoinAuditAdded,
  markDirectJoinAuditFailed,
} from './direct-join-store.ts';
import { getDirectWebJoinEnabled } from './admin-settings.ts';
import { addTrackedGroupUser } from './whatsapp.ts';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TERMS_VERSION = 'v1';
const AUDIT_RETENTION_MS = 90 * 24 * 60 * 60_000;

export class DirectJoinPublicError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DirectJoinPublicError';
    this.status = status;
  }
}

export function normalizeUsPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  const nationalNumber = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (nationalNumber.length !== 10) {
    throw new DirectJoinPublicError('Enter a valid US phone number.', 400);
  }
  return `1${nationalNumber}@s.whatsapp.net`;
}

export class DirectJoinRateLimiter {
  private readonly attempts = new Map<string, number[]>();
  private readonly options: { maxAttempts: number; windowMs: number };

  constructor(options: { maxAttempts: number; windowMs: number }) {
    this.options = options;
  }

  consume(ipAddress: string, now = Date.now()): boolean {
    const cutoff = now - this.options.windowMs;
    const recent = (this.attempts.get(ipAddress) ?? []).filter((time) => time > cutoff);
    if (recent.length >= this.options.maxAttempts) {
      this.attempts.set(ipAddress, recent);
      return false;
    }
    recent.push(now);
    this.attempts.set(ipAddress, recent);
    return true;
  }
}

export async function verifyTurnstileToken(
  token: string,
  secretKey: string,
  ipAddress: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const body = new URLSearchParams({
    secret: secretKey,
    response: token,
    remoteip: ipAddress,
  });
  const response = await fetchImpl(TURNSTILE_VERIFY_URL, { method: 'POST', body });
  if (!response.ok) throw new Error(`Turnstile verification failed with HTTP ${response.status}`);
  const result = await response.json() as { success?: boolean };
  return result.success === true;
}

interface DirectJoinServiceDeps {
  getDirectWebJoinEnabled: () => Promise<boolean>;
  getTurnstileSecretKey: () => string | undefined;
  verifyTurnstile: (token: string, secretKey: string, ipAddress: string) => Promise<boolean>;
  createAuditRecord: typeof createDirectJoinAudit;
  markAuditAdded: typeof markDirectJoinAuditAdded;
  markAuditFailed: typeof markDirectJoinAuditFailed;
  addTrackedGroupUser: typeof addTrackedGroupUser;
}

export function createDirectJoinService(deps: DirectJoinServiceDeps) {
  return {
    async submit(input: {
      phoneNumber: string;
      acceptedTerms: boolean;
      turnstileToken: string;
      ipAddress: string;
    }): Promise<{ outcome: 'added' }> {
      if (!await deps.getDirectWebJoinEnabled()) {
        throw new DirectJoinPublicError('Direct group access requests are currently unavailable.', 503);
      }
      if (input.acceptedTerms !== true) {
        throw new DirectJoinPublicError('You must accept the Terms & Conditions.', 400);
      }
      if (!input.turnstileToken) {
        throw new DirectJoinPublicError('Complete the security check and try again.', 400);
      }
      const secretKey = deps.getTurnstileSecretKey();
      if (!secretKey) {
        throw new DirectJoinPublicError('Direct group access requests are currently unavailable.', 503);
      }
      let captchaValid: boolean;
      try {
        captchaValid = await deps.verifyTurnstile(input.turnstileToken, secretKey, input.ipAddress);
      } catch (err) {
        console.error('[direct-join] Turnstile verification failed:', err);
        throw new DirectJoinPublicError('Unable to verify the security check. Try again shortly.', 503);
      }
      if (!captchaValid) {
        throw new DirectJoinPublicError('The security check expired or was invalid. Try again.', 400);
      }

      const userJid = normalizeUsPhoneNumber(input.phoneNumber);
      const now = new Date();
      const audit = await deps.createAuditRecord({
        userJid,
        termsAcceptedAt: now,
        termsVersion: TERMS_VERSION,
        expiresAt: new Date(now.getTime() + AUDIT_RETENTION_MS),
      });
      try {
        const result = await deps.addTrackedGroupUser(userJid);
        if (result.status !== '200') {
          await deps.markAuditFailed(audit.id, {
            whatsappStatus: result.status,
            reason: 'WhatsApp rejected the add request.',
          });
          throw new DirectJoinPublicError('Unable to add this number to the group. Contact an administrator.', 409);
        }
        await deps.markAuditAdded(audit.id, result.status);
        return { outcome: 'added' };
      } catch (err) {
        if (err instanceof DirectJoinPublicError) throw err;
        console.error('[direct-join] WhatsApp add failed:', err);
        await deps.markAuditFailed(audit.id, { reason: 'WhatsApp add request failed.' });
        throw new DirectJoinPublicError('Unable to add this number to the group. Contact an administrator.', 503);
      }
    },
  };
}

export const directJoinRateLimiter = new DirectJoinRateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60_000,
});

export const directJoinService = createDirectJoinService({
  getDirectWebJoinEnabled,
  getTurnstileSecretKey: () => process.env.TURNSTILE_SECRET_KEY,
  verifyTurnstile: verifyTurnstileToken,
  createAuditRecord: createDirectJoinAudit,
  markAuditAdded: markDirectJoinAuditAdded,
  markAuditFailed: markDirectJoinAuditFailed,
  addTrackedGroupUser,
});
