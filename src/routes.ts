import path from 'path';
import express, { Router, type Request, type Response } from 'express';
import apiRouter from './api-routes.ts';
import { createRequireAdminPage, getConfiguredAdminEmails } from './auth.ts';

const router = Router();
const ADMIN_DIST_DIR = path.resolve(process.cwd(), 'client/admin/dist');
const ADMIN_INDEX = path.join(ADMIN_DIST_DIR, 'index.html');
const JOIN_DIST_DIR = path.resolve(process.cwd(), 'client/join/dist');
const JOIN_INDEX = path.join(JOIN_DIST_DIR, 'index.html');

router.use('/api', apiRouter);

router.use('/admin', createRequireAdminPage(getConfiguredAdminEmails()));
router.use('/admin/dashboard', express.static(ADMIN_DIST_DIR, { index: false }));
router.get('/admin/dashboard', (_req: Request, res: Response) => {
  res.sendFile(ADMIN_INDEX);
});

router.use('/join', express.static(JOIN_DIST_DIR, { index: false }));
router.get('/join/:token', (_req: Request, res: Response) => {
  res.sendFile(JOIN_INDEX);
});

export default router;
