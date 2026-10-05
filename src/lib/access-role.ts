import "server-only";
import { NextRequest } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";

export async function verifiedAccessEmail(request: NextRequest): Promise<string | null> {
  const domain = process.env.ACCESS_TEAM_DOMAIN;
  const audience = process.env.ACCESS_AUD;
  if (!domain || !audience || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain)) return null;
  const token = request.headers.get("Cf-Access-Jwt-Assertion") || request.cookies.get("CF_Authorization")?.value;
  if (!token) return null;
  try {
    const jwks = createRemoteJWKSet(new URL(`${domain}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(token, jwks, { issuer: domain, audience });
    return typeof payload.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ? payload.email : null;
  } catch { return null; }
}

export async function ownerEmail(request: NextRequest): Promise<string | null> {
  const allowed = process.env.SWITCHBOARD_OWNER_EMAIL;
  const email = await verifiedAccessEmail(request);
  return allowed && email?.toLowerCase() === allowed.toLowerCase() ? email : null;
}
