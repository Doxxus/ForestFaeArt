import { SignJWT, jwtVerify } from "jose";

export interface SessionClaims {
  userId: string;
  sessionVersion: number;
}

export const WEB_SESSION_SECONDS = 12 * 60 * 60;
export const POS_SESSION_SECONDS = 24 * 60 * 60;

const ISSUER = "forestfae";
const AUDIENCE = "forestfae-api";

const key = (secret: string) => {
  if (secret.length < 32) throw new Error("Session secret must be at least 32 characters");
  return new TextEncoder().encode(secret);
};

export async function signSessionToken(
  claims: SessionClaims,
  secret: string,
  opts: { ttlSeconds?: number; now?: Date } = {},
): Promise<string> {
  const iat = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  return new SignJWT({ sv: claims.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + (opts.ttlSeconds ?? WEB_SESSION_SECONDS))
    .sign(key(secret));
}

// Returns null for any invalid, expired or tampered token. The role is deliberately not part of the token.
export async function verifySessionToken(
  token: string,
  secret: string,
  opts: { now?: Date } = {},
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
      currentDate: opts.now,
    });
    if (typeof payload.sub !== "string" || typeof payload.sv !== "number") return null;
    return { userId: payload.sub, sessionVersion: payload.sv };
  } catch {
    return null;
  }
}
