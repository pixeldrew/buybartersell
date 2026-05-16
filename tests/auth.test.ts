import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRequireAdminApi,
  createRequireAdminPage,
  isAllowedAdminEmail,
  parseOidcConfig,
} from '../src/auth.ts';

function createResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    send(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return response;
}

test('parses oidc config from OIDC-prefixed environment variables', () => {
  const result = parseOidcConfig({
    OIDC_ISSUER_BASE_URL: 'https://accounts.google.com',
    OIDC_BASE_URL: 'https://example.test/',
    OIDC_CLIENT_ID: 'client-id',
    OIDC_CLIENT_SECRET: 'client-secret',
    OIDC_SECRET: 'session-secret',
    ADMIN_EMAILS: ' Admin@Example.test,other@example.test ',
  });

  assert.equal(result.configured, true);
  if (!result.configured) throw new Error('expected configured result');
  assert.equal(result.config.baseURL, 'https://example.test');
  assert.deepEqual(result.config.adminEmails, ['admin@example.test', 'other@example.test']);
});

test('reports missing oidc config and admin allowlist values', () => {
  const result = parseOidcConfig({});

  assert.equal(result.configured, false);
  if (result.configured) throw new Error('expected unconfigured result');
  assert.deepEqual(result.missing, [
    'OIDC_ISSUER_BASE_URL',
    'OIDC_BASE_URL',
    'OIDC_CLIENT_ID',
    'OIDC_CLIENT_SECRET',
    'OIDC_SECRET',
    'ADMIN_EMAILS',
  ]);
});

test('matches admin emails case-insensitively', () => {
  assert.equal(isAllowedAdminEmail('ADMIN@example.test', ['admin@example.test']), true);
  assert.equal(isAllowedAdminEmail('user@example.test', ['admin@example.test']), false);
  assert.equal(isAllowedAdminEmail(null, ['admin@example.test']), false);
});

test('admin api middleware returns 401 json for unauthenticated requests', () => {
  const middleware = createRequireAdminApi(['admin@example.test']);
  const response = createResponse();
  let nextCalled = false;

  middleware({ oidc: { isAuthenticated: () => false } } as never, response as never, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'Authentication required' });
});

test('admin api middleware returns 403 json for unauthorized users', () => {
  const middleware = createRequireAdminApi(['admin@example.test']);
  const response = createResponse();
  let nextCalled = false;

  middleware({
    oidc: {
      isAuthenticated: () => true,
      user: { email: 'user@example.test', email_verified: true },
    },
  } as never, response as never, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: 'Forbidden' });
});

test('admin api middleware returns 401 json for unverified emails', () => {
  const middleware = createRequireAdminApi(['admin@example.test']);
  const response = createResponse();
  let nextCalled = false;

  middleware({
    oidc: {
      isAuthenticated: () => true,
      user: { email: 'admin@example.test', email_verified: false },
    },
  } as never, response as never, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'Authentication required' });
});

test('admin api middleware allows allowlisted users', () => {
  const middleware = createRequireAdminApi(['admin@example.test']);
  const response = createResponse();
  let nextCalled = false;

  middleware({
    oidc: {
      isAuthenticated: () => true,
      user: { email: 'ADMIN@example.test', email_verified: true },
    },
  } as never, response as never, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(response.statusCode, 200);
});

test('admin page middleware redirects unauthenticated requests to login', () => {
  const middleware = createRequireAdminPage(['admin@example.test']);
  const response = createResponse();
  let returnTo: string | undefined;

  middleware({
    originalUrl: '/admin/dashboard',
    oidc: {
      isAuthenticated: () => false,
    },
  } as never, {
    ...response,
    oidc: {
      login: (options: { returnTo: string }) => {
        returnTo = options.returnTo;
      },
    },
  } as never, () => undefined);

  assert.equal(returnTo, '/admin/dashboard');
});

test('admin middleware fails closed when oidc config is missing', () => {
  const middleware = createRequireAdminApi(null);
  const response = createResponse();
  let nextCalled = false;

  middleware({} as never, response as never, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, { error: 'Admin authentication is not configured' });
});
