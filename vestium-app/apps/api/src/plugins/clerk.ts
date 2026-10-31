// ─── Clerk JWT authentication plugin ─────────────────────────────────────────
// Verifies Clerk session tokens on every request (except /health).
// Attaches authenticated user + org context + role to request for downstream use.

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { OrgRole } from '@complianceforge/types';

type AuthContext = {
  userId: string;
  orgId: string | null;
  role: OrgRole;
};

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

/** Map Clerk org role string to local OrgRole. */
function mapClerkRole(clerkRole: string | null | undefined): OrgRole {
  if (!clerkRole) return 'learner';
  // Clerk roles are prefixed: org:admin, org:hr_manager, org:reviewer, org:member
  const short = clerkRole.replace(/^org:/, '');
  switch (short) {
    case 'admin':      return 'admin';
    case 'hr_manager': return 'hr_manager';
    case 'reviewer':   return 'reviewer';
    default:           return 'learner';
  }
}

const DEFAULT_AUTH: AuthContext = { userId: '', orgId: null, role: 'learner' };

const clerkPlugin: FastifyPluginAsync = async (app) => {
  // Fastify 5 disallows object reference decorators on requests.
  // Use a getter/setter backed by a WeakMap so each request has isolated state.
  const authStore = new WeakMap<FastifyRequest, AuthContext>();

  app.decorateRequest('auth', {
    getter(this: FastifyRequest): AuthContext {
      return authStore.get(this) ?? DEFAULT_AUTH;
    },
    setter(this: FastifyRequest, value: AuthContext) {
      authStore.set(this, value);
    },
  });

  app.addHook('onRequest', async (request: FastifyRequest, reply) => {
    request.auth = { ...DEFAULT_AUTH };

    // Public routes (no auth):
    // - health check
    // - static image assets used in lessons
    // - certificate verification endpoint
    const path = request.url.split('?')[0] ?? request.url;
    if (path === '/health' || path.startsWith('/assets/') || path.startsWith('/verify/')) return;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      reply.status(401).send({ ok: false, error: 'Missing or malformed Authorization header' });
      return;
    }

    const token = authHeader.slice(7);

    // Dev-only: accept a static test token for CLI test harnesses (e.g. test-matrix runner).
    // The TEST_API_TOKEN env var must be set AND NODE_ENV must not be production.
    const testToken = process.env.TEST_API_TOKEN;
    if (testToken && token === testToken && process.env.NODE_ENV !== 'production') {
      const testUserId = process.env.TEST_USER_ID ?? 'test-user';
      const testOrgId  = process.env.TEST_ORG_ID  ?? 'test-org';
      request.auth = { userId: testUserId, orgId: testOrgId, role: 'admin' };
      return;
    }

    try {
      const { verifyToken } = await import('@clerk/backend');
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });

      const claims = payload as Record<string, unknown>;
      const tokenOrgId = claims.org_id as string | null | undefined;
      const tokenOrgRole = claims.org_role as string | null | undefined;

      // Personal workspaces get admin role (you own your space)
      const isPersonal = !tokenOrgId;
      const orgId = tokenOrgId ?? `user_${payload.sub}`;

      request.auth = {
        userId: payload.sub,
        orgId,
        role: isPersonal ? 'admin' : mapClerkRole(tokenOrgRole),
      };
    } catch {
      reply.status(401).send({ ok: false, error: 'Invalid or expired session token' });
    }
  });
};

export default fp(clerkPlugin, { name: 'clerk' });
export { clerkPlugin, mapClerkRole };
