import { Router, type Request, type Response } from 'express';
import { getConnectionStatus } from './whatsapp.ts';
import adminRouter from './admin-routes.ts';
import joinRouter, {
  acceptJoinToken,
  getJoinTokenStatus,
  rejectJoinToken,
} from './join-routes.ts';
import listingsRouter from './listings-routes.ts';

const apiRouter = Router();

apiRouter.get('/status', (_req: Request, res: Response) => {
  res.json({ connected: getConnectionStatus() });
});

apiRouter.use('/admin', adminRouter);
apiRouter.use('/join', joinRouter);
apiRouter.use('/listings', listingsRouter);

export { acceptJoinToken, getJoinTokenStatus, rejectJoinToken };

export default apiRouter;
