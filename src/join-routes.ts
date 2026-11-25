import { Router, type Request, type Response } from 'express';
import { getDirectWebJoinEnabled } from './admin-settings.ts';
import {
  DirectJoinPublicError,
  directJoinRateLimiter,
  directJoinService,
  verifyTurnstileToken,
} from './direct-join.ts';
import { approveRequest, rejectRequest, resolveToken } from './join-approval.ts';

const joinRouter = Router();

interface JoinJsonResponse {
  status: number;
  body: {
    ok: boolean;
    error?: string;
    outcome?: 'approved' | 'declined' | 'added';
    available?: boolean;
    turnstileSiteKey?: string;
  };
}

interface DirectJoinBody {
  phoneNumber: string;
  acceptedTerms: true;
  turnstileToken: string;
}

interface DirectJoinConfigDeps {
  getDirectWebJoinEnabled: () => Promise<boolean>;
  getTurnstileSiteKey: () => string | undefined;
  getTurnstileSecretKey: () => string | undefined;
}

interface DirectJoinSubmitDeps {
  rateLimiter: Pick<typeof directJoinRateLimiter, 'consume'>;
  service: Pick<typeof directJoinService, 'submit'>;
}

function joinTokenErrorMessage(err: unknown): { status: number; message: string } {
  const code = (err as { code?: string }).code;
  const message =
    code === 'EXPIRED' ? 'This invitation link has expired.' :
    code === 'USED'    ? 'This invitation link has already been used.' :
                         'This invitation link is invalid.';
  return { status: code === 'NOT_FOUND' ? 404 : 410, message };
}

export async function getJoinTokenStatus(token: string, config = { siteKey: process.env.TURNSTILE_SITE_KEY, secretKey: process.env.TURNSTILE_SECRET_KEY }): Promise<JoinJsonResponse> {
  try {
    await resolveToken(token);
    if (!config.siteKey || !config.secretKey) return { status: 503, body: { ok: false, error: 'Security check is currently unavailable.' } };
    return { status: 200, body: { ok: true, turnstileSiteKey: config.siteKey } };
  } catch (err) {
    const { status, message } = joinTokenErrorMessage(err);
    return { status, body: { ok: false, error: message } };
  }
}

interface TokenVerificationDeps {
  secretKey: string | undefined;
  verify: typeof verifyTurnstileToken;
}

async function decideJoinToken(
  token: string, body: unknown, ipAddress: string, action: 'accept' | 'reject',
  deps: TokenVerificationDeps,
): Promise<JoinJsonResponse> {
  const captcha = (body as { turnstileToken?: unknown } | null)?.turnstileToken;
  if (typeof captcha !== 'string' || !captcha.trim()) {
    return { status: 400, body: { ok: false, error: 'Complete the security check and try again.' } };
  }
  if (!deps.secretKey) return { status: 503, body: { ok: false, error: 'Security check is currently unavailable.' } };
  try {
    if (!await deps.verify(captcha.trim(), deps.secretKey, ipAddress)) {
      return { status: 400, body: { ok: false, error: 'The security check expired or was invalid. Try again.' } };
    }
  } catch (err) {
    console.error('[join] Turnstile verification failed:', err);
    return { status: 503, body: { ok: false, error: 'Unable to verify the security check. Try again shortly.' } };
  }
  try {
    if (action === 'accept') await approveRequest(token);
    else await rejectRequest(token);
    return { status: 200, body: { ok: true, outcome: action === 'accept' ? 'approved' : 'declined' } };
  } catch (err) {
    const { status, message } = joinTokenErrorMessage(err);
    return { status, body: { ok: false, error: message } };
  }
}

export async function acceptJoinToken(token: string, body: unknown, ipAddress: string, deps: TokenVerificationDeps = { secretKey: process.env.TURNSTILE_SECRET_KEY, verify: verifyTurnstileToken }): Promise<JoinJsonResponse> {
  return decideJoinToken(token, body, ipAddress, 'accept', deps);
}

export async function rejectJoinToken(token: string, body: unknown, ipAddress: string, deps: TokenVerificationDeps = { secretKey: process.env.TURNSTILE_SECRET_KEY, verify: verifyTurnstileToken }): Promise<JoinJsonResponse> {
  return decideJoinToken(token, body, ipAddress, 'reject', deps);
}

export function parseDirectJoinBody(body: unknown): DirectJoinBody {
  if (!body || typeof body !== 'object') {
    throw new DirectJoinPublicError('Request body must be an object.', 400);
  }
  const { phoneNumber, acceptedTerms, turnstileToken } = body as {
    phoneNumber?: unknown;
    acceptedTerms?: unknown;
    turnstileToken?: unknown;
  };
  if (typeof phoneNumber !== 'string' || !phoneNumber.trim()) {
    throw new DirectJoinPublicError('phoneNumber is required.', 400);
  }
  if (acceptedTerms !== true) {
    throw new DirectJoinPublicError('You must accept the Terms & Conditions.', 400);
  }
  if (typeof turnstileToken !== 'string' || !turnstileToken.trim()) {
    throw new DirectJoinPublicError('Complete the security check and try again.', 400);
  }
  return {
    phoneNumber: phoneNumber.trim(),
    acceptedTerms,
    turnstileToken: turnstileToken.trim(),
  };
}

export async function getDirectJoinConfig(deps: DirectJoinConfigDeps = {
  getDirectWebJoinEnabled,
  getTurnstileSiteKey: () => process.env.TURNSTILE_SITE_KEY,
  getTurnstileSecretKey: () => process.env.TURNSTILE_SECRET_KEY,
}): Promise<JoinJsonResponse> {
  const enabled = await deps.getDirectWebJoinEnabled();
  const turnstileSiteKey = deps.getTurnstileSiteKey();
  const configured = Boolean(turnstileSiteKey && deps.getTurnstileSecretKey());
  return {
    status: 200,
    body: enabled && configured
      ? { ok: true, available: true, turnstileSiteKey }
      : { ok: true, available: false },
  };
}

export async function submitDirectJoin(
  body: unknown,
  ipAddress: string,
  deps: DirectJoinSubmitDeps = { rateLimiter: directJoinRateLimiter, service: directJoinService },
): Promise<JoinJsonResponse> {
  if (!deps.rateLimiter.consume(ipAddress)) {
    return { status: 429, body: { ok: false, error: 'Too many requests. Try again later.' } };
  }
  try {
    const input = parseDirectJoinBody(body);
    const result = await deps.service.submit({ ...input, ipAddress });
    return { status: 200, body: { ok: true, outcome: result.outcome } };
  } catch (err) {
    const status = err instanceof DirectJoinPublicError ? err.status : 503;
    const message = err instanceof DirectJoinPublicError
      ? err.message
      : 'Unable to process this request. Try again later.';
    if (!(err instanceof DirectJoinPublicError)) {
      console.error('[direct-join] Request failed:', err);
    }
    return { status, body: { ok: false, error: message } };
  }
}

joinRouter.get('/direct/config', async (_req: Request, res: Response) => {
  try {
    const result = await getDirectJoinConfig();
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[direct-join] Unable to load configuration:', err);
    res.status(503).json({ ok: false, error: 'Direct group access requests are currently unavailable.' });
  }
});

joinRouter.post('/direct', async (req: Request, res: Response) => {
  const result = await submitDirectJoin(req.body, req.ip ?? req.socket.remoteAddress ?? 'unknown');
  res.status(result.status).json(result.body);
});

joinRouter.get('/:token/status', async (req: Request, res: Response) => {
  const result = await getJoinTokenStatus(req.params['token'] as string);
  res.status(result.status).json(result.body);
});

joinRouter.post('/:token/accept', async (req: Request, res: Response) => {
  const result = await acceptJoinToken(req.params['token'] as string, req.body, req.ip ?? req.socket.remoteAddress ?? 'unknown');
  res.status(result.status).json(result.body);
});

joinRouter.post('/:token/reject', async (req: Request, res: Response) => {
  const result = await rejectJoinToken(req.params['token'] as string, req.body, req.ip ?? req.socket.remoteAddress ?? 'unknown');
  res.status(result.status).json(result.body);
});

export default joinRouter;
