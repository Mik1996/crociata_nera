import { createHash, randomBytes } from 'node:crypto';
import { errors, jwtVerify, SignJWT } from 'jose';
import { env } from '../config/env';
import { UserRole } from './user-role';

const ISSUER = 'crociata-nera-backend';
const AUDIENCE = 'crociata-nera-web';
const ALGORITHM = 'HS256';

export interface AccessTokenPayload {
  /** User id. */
  sub: string;
  roles: UserRole[];
}

export interface IssuedAccessToken {
  token: string;
  expiresAt: Date;
}

function secret(): Uint8Array {
  return new TextEncoder().encode(env().JWT_SECRET);
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<IssuedAccessToken> {
  const expiresAt = new Date(Date.now() + env().ACCESS_TOKEN_EXPIRES_IN * 1000);
  const token = await new SignJWT({ roles: payload.roles })
    .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret());
  return { token, expiresAt };
}

/** Verifies signature, issuer, audience and expiry; `null` if the token is not valid. */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: [ALGORITHM],
    });
    const roles = Array.isArray(payload.roles)
      ? payload.roles.filter((r): r is UserRole => Object.values(UserRole).includes(r as UserRole))
      : [];
    return payload.sub ? { sub: payload.sub, roles } : null;
  } catch (error) {
    if (error instanceof errors.JOSEError) return null;
    throw error;
  }
}

/** Opaque refresh token: 256 random bits. Only its hash is stored. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
