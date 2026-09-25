import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet } from "jose/jwks/remote";
import { jwtVerify } from "jose/jwt/verify";

export async function proxy(request: NextRequest) {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(request.nextUrl.hostname);
  if (process.env.NODE_ENV === "development" && local && process.env.SWITCHBOARD_ALLOW_LOCAL_UNAUTHENTICATED === "true") return NextResponse.next();
  const domain = process.env.ACCESS_TEAM_DOMAIN;
  const audience = process.env.ACCESS_AUD;
  if (!domain || !audience || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain)) {
    return new NextResponse("Access is not configured", { status: 503 });
  }
  const token = request.headers.get("Cf-Access-Jwt-Assertion") || request.cookies.get("CF_Authorization")?.value;
  if (!token) return new NextResponse("Sign-in required", { status: 401 });
  try {
    const jwks = createRemoteJWKSet(new URL(`${domain}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(token, jwks, { issuer: domain, audience });
    if (typeof payload.email !== "string") return new NextResponse("Account not permitted", { status: 403 });
    return NextResponse.next();
  } catch {
    return new NextResponse("Invalid or expired sign-in", { status: 401 });
  }
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
