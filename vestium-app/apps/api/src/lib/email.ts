import { Resend } from 'resend';
import { createClerkClient } from '@clerk/backend';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const clerk = process.env.CLERK_SECRET_KEY
  ? createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
  : null;

async function getOrgAdminEmails(clerkOrgId: string): Promise<string[]> {
  if (!clerk) return [];
  try {
    const memberships = await clerk.organizations.getOrganizationMembershipList({
      organizationId: clerkOrgId
    });
    return memberships.data
      .filter((m) => m.role === 'org:admin')
      .map((m) => m.publicUserData?.identifier)
      .filter((e): e is string => typeof e === 'string' && e.includes('@'));
  } catch (err) {
    console.warn('[email] Failed to fetch org admin emails:', err);
    return [];
  }
}

export async function sendStaleModuleAlert(
  clerkOrgId: string,
  moduleTitles: string[]
): Promise<void> {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — stale alert suppressed');
    return;
  }

  const emails = await getOrgAdminEmails(clerkOrgId);
  if (emails.length === 0) {
    console.warn('[email] No admin emails found for org', clerkOrgId);
    return;
  }

  const count = moduleTitles.length;
  const moduleList = moduleTitles.map((t) => `• ${t}`).join('\n');
  const moduleListHtml = moduleTitles.map((t) => `<li>${t}</li>`).join('');

  const text = `Vestium — Action Required\n\n${count} training module${count !== 1 ? 's have' : ' has'} been flagged as stale because a regulatory source document they depend on has been updated.\n\nAffected modules:\n${moduleList}\n\nPlease log in to Vestium and review these modules. Stale modules should not be used for new learner enrolments until they have been regenerated and re-attested.\n\nLog in: ${process.env.FRONTEND_URL ?? 'https://vestium.app'}/modules`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;color:#1e293b;max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#0f172a;padding:16px 24px;border-radius:8px 8px 0 0">
    <p style="color:#f8fafc;font-size:14px;font-weight:600;margin:0">Vestium</p>
  </div>
  <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    <h2 style="margin:0 0 8px;font-size:18px;color:#dc2626">Action Required — Stale Training Module${count !== 1 ? 's' : ''}</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#475569">
      ${count} training module${count !== 1 ? 's have' : ' has'} been flagged as <strong>stale</strong> because a regulatory source document they depend on has been updated.
    </p>
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#1e293b">Affected modules:</p>
    <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;color:#475569">
      ${moduleListHtml}
    </ul>
    <p style="margin:0 0 20px;font-size:13px;color:#64748b">
      Stale modules should not be used for new learner enrolments until they have been regenerated and re-attested by a competent person reviewer.
    </p>
    <a href="${process.env.FRONTEND_URL ?? 'https://vestium.app'}/modules"
       style="display:inline-block;background:#f59e0b;color:#0f172a;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none">
      Review Modules →
    </a>
    <p style="margin:24px 0 0;font-size:11px;color:#94a3b8">
      This is an automated compliance alert from Vestium. Do not reply to this email.
    </p>
  </div>
</body>
</html>`;

  await resend.emails.send({
    from: 'Vestium <onboarding@resend.dev>',
    to: emails,
    subject: `Action required — ${count} training module${count !== 1 ? 's' : ''} flagged as stale`,
    text,
    html
  });
}
