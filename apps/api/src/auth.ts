import { createHash } from 'node:crypto';
import { betterAuth, type Auth } from 'better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { APIError } from 'better-auth/api';
import { Pool } from 'pg';
import type { IncomingHttpHeaders } from 'node:http';

export interface AuthRuntime {
  auth: Auth<any>;
  pool: Pool;
}

export interface MemberContext {
  id: string;
  email: string;
  name: string;
  authUserId: string;
}

export function createAuthRuntime(): AuthRuntime {
  const databaseUrl = process.env['DATABASE_URL'];
  const secret = process.env['BETTER_AUTH_SECRET'];
  const baseURL = process.env['BETTER_AUTH_URL'];
  const webOrigin = process.env['WEB_APP_ORIGIN'] ?? 'http://localhost:4200';
  if (!databaseUrl || !secret || secret.length < 32 || !baseURL) {
    throw new Error('Member authentication requires DATABASE_URL, BETTER_AUTH_URL, and a BETTER_AUTH_SECRET of at least 32 characters.');
  }
  if (process.env['NODE_ENV'] === 'production') {
    try {
      if (new URL(baseURL).protocol !== 'https:' || new URL(webOrigin).protocol !== 'https:') throw new Error('HTTPS is required.');
    } catch {
      throw new Error('Production member authentication requires HTTPS BETTER_AUTH_URL and WEB_APP_ORIGIN values.');
    }
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 5000 });
  const auth = betterAuth({
    appName: 'A-P-P-A-I',
    baseURL,
    secret,
    database: pool,
    trustedOrigins: Array.from(new Set([webOrigin, 'https://appai.local'])),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
    },
    user: {
      additionalFields: {
        inviteCode: { type: 'string', required: false, input: true, returned: false },
      },
    },
    session: {
      expiresIn: 60 * 60,
      updateAge: 5 * 60,
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60 * 60, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: process.env['NODE_ENV'] === 'production',
      disableCSRFCheck: false,
      disableOriginCheck: false,
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const inviteCode = user['inviteCode'];
            if (typeof inviteCode !== 'string' || inviteCode.length < 32 || inviteCode.length > 128) {
              throw new APIError('FORBIDDEN', { message: 'A valid member invitation is required.' });
            }
            const digest = createHash('sha256').update(inviteCode).digest('hex');
            const consumed = await pool.query(
              `UPDATE member_invites
               SET consumed_at = now()
               WHERE token_digest = $1 AND lower(email) = lower($2)
                 AND consumed_at IS NULL AND expires_at > now()
               RETURNING token_digest`,
              [digest, user.email],
            );
            if (consumed.rowCount !== 1) {
              throw new APIError('FORBIDDEN', { message: 'The invitation is invalid, expired, or assigned to another email.' });
            }
            return { data: { ...user, inviteCode: null } };
          },
        },
      },
    },
  });
  return { auth, pool };
}

export async function resolveMember(runtime: AuthRuntime, headers: IncomingHttpHeaders): Promise<MemberContext | null> {
  const requestHeaders = fromNodeHeaders(headers);
  const session = await runtime.auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;

  const absoluteLifetimeMs = 8 * 60 * 60 * 1000;
  if (Date.now() - new Date(session.session.createdAt).getTime() > absoluteLifetimeMs) {
    await runtime.auth.api.revokeSessions({ headers: requestHeaders });
    return null;
  }

  const result = await runtime.pool.query<{ id: string; active: boolean }>(
    `INSERT INTO users (identity_provider_subject)
     VALUES ($1)
     ON CONFLICT (identity_provider_subject) DO UPDATE SET active = users.active
     RETURNING id, active`,
    [session.user.id],
  );
  const member = result.rows[0];
  if (!member?.active) {
    await runtime.auth.api.revokeSessions({ headers: requestHeaders });
    return null;
  }

  return {
    id: member.id,
    authUserId: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}
