import path from 'path';
import { Router, type Request, type Response } from 'express';
import expressStaticGzip from 'express-static-gzip';
import apiRouter from './api-routes.ts';
import { createRequireAdminPage, getConfiguredAdminEmails } from './auth.ts';

const router = Router();
const ADMIN_DIST_DIR = path.resolve(process.cwd(), 'client/admin/dist');
const ADMIN_INDEX = path.join(ADMIN_DIST_DIR, 'index.html');
const JOIN_DIST_DIR = path.resolve(process.cwd(), 'client/join/dist');
const JOIN_INDEX = path.join(JOIN_DIST_DIR, 'index.html');

router.use('/api', apiRouter);

router.use('/admin', createRequireAdminPage(getConfiguredAdminEmails()));
router.use(
  '/admin/dashboard',
  expressStaticGzip(ADMIN_DIST_DIR, {
    enableBrotli: true,
    index: false,
    orderPreference: ['br'],
    serveStatic: { index: false },
  }),
);
router.get('/admin/dashboard', (_req: Request, res: Response) => {
  res.sendFile(ADMIN_INDEX);
});

router.use(
  '/join',
  expressStaticGzip(JOIN_DIST_DIR, {
    enableBrotli: true,
    index: false,
    orderPreference: ['br'],
    serveStatic: { index: false },
  }),
);
router.get('/join/:token', (_req: Request, res: Response) => {
  res.sendFile(JOIN_INDEX);
});

export default router;
