import { jwtVerify, type JWTPayload } from "jose";

const SECRET = process.env.JWT_SECRET ?? "";
if (!SECRET || SECRET.length < 32) {
  if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET missing or too short.");
  console.warn("[wallet] JWT_SECRET missing or too short, using dev key");
}

const KEY = new TextEncoder().encode(
  SECRET || "dev-only-secret-replace-immediately-with-a-real-secret-please"
);

const ISS = "googolplex.auth";
const AUD = "googolplex.client";

export type AccessClaims = JWTPayload & {
  sub: string;
  email: string;
  code11: string;
  role: "user" | "admin";
  type: "access";
};

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, KEY, {
      issuer: ISS,
      audience: AUD
    });
    if (payload.type !== "access") return null;
    return payload as AccessClaims;
  } catch {
    return null;
  }
}
