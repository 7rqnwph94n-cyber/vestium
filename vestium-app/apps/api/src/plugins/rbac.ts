// ─── Role-Based Access Control middleware ────────────────────────────────────
// Fastify preHandler that checks request.auth.role against allowed roles.
// Usage: app.get('/path', { preHandler: [requireRole('admin', 'hr_manager')] }, handler)

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { OrgRole } from '@complianceforge/types';

export function requireRole(
  ...allowed: OrgRole[]
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!allowed.includes(request.auth.role)) {
      reply.status(403).send({ ok: false, error: 'Insufficient permissions' });
    }
  };
}
