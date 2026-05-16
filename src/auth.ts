import { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { auth } from 'express-openid-connect';

const REQUIRED_ENV_KEYS = [
  'OIDC_ISSUER_BASE_URL',
  'OIDC_BASE_URL',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_SECRET',
  'ADMIN_EMAILS',
] as const;

interface ConfiguredOidcConfig {
  configured: true;
  config: {
    issuerBaseURL: string;
    baseURL: string;
    clientID: string;
    clientSecret: string;
    secret: string;
    adminEmails: string[];
  };
}

interface MissingOidcConfig {
  configured: false;
  missing: string[];
}

export type OidcConfig = ConfiguredOidcConfig | MissingOidcConfig;

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function parseAdminEmails(value: string): string[] {
  return value
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function parseOidcConfig(env: NodeJS.ProcessEnv = process.env): OidcConfig {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !env[key]?.trim());
  if (missing.length) return { configured: false, missing: [...missing] };

  const adminEmails = parseAdminEmails(env.ADMIN_EMAILS as string);
  if (!adminEmails.length) return { configured: false, missing: ['ADMIN_EMAILS'] };

  return {
    configured: true,
    config: {
      issuerBaseURL: normalizeUrl(env.OIDC_ISSUER_BASE_URL as string),
      baseURL: normalizeUrl(env.OIDC_BASE_URL as string),
      clientID: env.OIDC_CLIENT_ID as string,
      clientSecret: env.OIDC_CLIENT_SECRET as string,
      secret: env.OIDC_SECRET as string,
      adminEmails,
    },
  };
}

export function isAllowedAdminEmail(email: unknown, adminEmails: string[]): boolean {
  return typeof email === 'string' && adminEmails.includes(email.trim().toLowerCase());
}

function getAuthenticatedAdminEmail(req: Request): string | null {
  if (!req.oidc?.isAuthenticated()) return null;
  if (req.oidc.user?.email_verified !== true) return null;
  return typeof req.oidc.user?.email === 'string' ? req.oidc.user.email : null;
}

function adminConfigMissingJson(res: Response): void {
  res.status(503).json({ error: 'Admin authentication is not configured' });
}

function adminConfigMissingPage(res: Response): void {
  res.status(503).send('Admin authentication is not configured');
}

export function createOidcMiddleware(config: OidcConfig = parseOidcConfig()): RequestHandler[] {
  if (!config.configured) return [];

  return [
    auth({
      authRequired: false,
      issuerBaseURL: config.config.issuerBaseURL,
      baseURL: config.config.baseURL,
      clientID: config.config.clientID,
      clientSecret: config.config.clientSecret,
      secret: config.config.secret,
      authorizationParams: {
        response_type: 'code',
        scope: 'openid profile email',
      },
    }),
  ];
}

export function getConfiguredAdminEmails(config: OidcConfig = parseOidcConfig()): string[] | null {
  return config.configured ? config.config.adminEmails : null;
}

export function createRequireAdminApi(adminEmails: string[] | null): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!adminEmails) {
      adminConfigMissingJson(res);
      return;
    }

    const email = getAuthenticatedAdminEmail(req);
    if (!email) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!isAllowedAdminEmail(email, adminEmails)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    next();
  };
}

export function createRequireAdminPage(adminEmails: string[] | null): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!adminEmails) {
      adminConfigMissingPage(res);
      return;
    }

    const email = getAuthenticatedAdminEmail(req);
    if (!email) {
      void res.oidc.login({ returnTo: req.originalUrl });
      return;
    }

    if (!isAllowedAdminEmail(email, adminEmails)) {
      res.status(403).send('Forbidden');
      return;
    }

    next();
  };
}
