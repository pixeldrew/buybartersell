import { Router, type Request, type Response } from 'express';
import { approveRequest, rejectRequest, resolveToken } from './join-approval.ts';

const joinRouter = Router();

interface JoinJsonResponse {
  status: number;
  body: {
    ok: boolean;
    error?: string;
    outcome?: 'approved' | 'declined';
  };
}

function joinTokenErrorMessage(err: unknown): { status: number; message: string } {
  const code = (err as { code?: string }).code;
  const message =
    code === 'EXPIRED' ? 'This invitation link has expired.' :
    code === 'USED'    ? 'This invitation link has already been used.' :
                         'This invitation link is invalid.';
  return { status: code === 'NOT_FOUND' ? 404 : 410, message };
}

export async function getJoinTokenStatus(token: string): Promise<JoinJsonResponse> {
  try {
    await resolveToken(token);
    return { status: 200, body: { ok: true } };
  } catch (err) {
    const { status, message } = joinTokenErrorMessage(err);
    return { status, body: { ok: false, error: message } };
  }
}

export async function acceptJoinToken(token: string): Promise<JoinJsonResponse> {
  try {
    await approveRequest(token);
    return { status: 200, body: { ok: true, outcome: 'approved' } };
  } catch (err) {
    const { status, message } = joinTokenErrorMessage(err);
    return { status, body: { ok: false, error: message } };
  }
}

export async function rejectJoinToken(token: string): Promise<JoinJsonResponse> {
  try {
    await rejectRequest(token);
    return { status: 200, body: { ok: true, outcome: 'declined' } };
  } catch (err) {
    const { status, message } = joinTokenErrorMessage(err);
    return { status, body: { ok: false, error: message } };
  }
}

joinRouter.get('/:token/status', async (req: Request, res: Response) => {
  const result = await getJoinTokenStatus(req.params['token'] as string);
  res.status(result.status).json(result.body);
});

joinRouter.post('/:token/accept', async (req: Request, res: Response) => {
  const result = await acceptJoinToken(req.params['token'] as string);
  res.status(result.status).json(result.body);
});

joinRouter.post('/:token/reject', async (req: Request, res: Response) => {
  const result = await rejectJoinToken(req.params['token'] as string);
  res.status(result.status).json(result.body);
});

export default joinRouter;
