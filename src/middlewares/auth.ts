import type { Request, Response, NextFunction } from "express";
import { ObjectId, type Filter, type Document } from "mongodb";
import { usersCollection } from "../utils/collections";
import { db } from "../config/db";

export interface AuthUser {
  _id: ObjectId;
  id: string;
  name: string;
  email: string;
  role: "customer" | "vendor" | "admin";
  status?: "active" | "inactive" | "blocked";
  subscriptionPlan?: "free" | "premium";
  subscriptionExpiresAt?: Date | null;
  businessName?: string;
  image?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Dynamically load ESM jose package
let joseModule: any = null;
async function getJose(): Promise<any> {
  if (!joseModule) {
    // Dynamic import works across ESM and CommonJS runtimes
    joseModule = await import("jose");
  }
  return joseModule;
}

let remoteJWKS: any = null;

async function getRemoteJWKS() {
  if (!remoteJWKS) {
    const { createRemoteJWKSet } = await getJose();
    const rawUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";
    const baseUrl = rawUrl.replace(/\/$/, "");
    remoteJWKS = createRemoteJWKSet(new URL(`${baseUrl}/api/auth/jwks`));
  }
  return remoteJWKS;
}

/**
 * Fallback to verify a JWT using active keys stored in the database's jwks collection.
 * This guarantees verification works even if the frontend dev server is temporarily offline.
 */
async function verifyWithDbJwks(token: string): Promise<any | null> {
  try {
    const { importJWK, jwtVerify } = await getJose();
    const jwks = await db
      .collection("jwks")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    for (const keyDoc of jwks) {
      if (keyDoc.publicKey && typeof keyDoc.publicKey === "string") {
        try {
          const jwkObj = JSON.parse(keyDoc.publicKey);
          const alg = keyDoc.alg || jwkObj.alg || "EdDSA";
          const key = await importJWK(jwkObj, alg);
          const result = await jwtVerify(token, key);
          return result.payload;
        } catch {
          // Continue to next key
        }
      }
    }
  } catch (err) {
    console.error("DB JWKS verification fallback error:", err);
  }
  return null;
}

/**
 * Verifies a JWT token signature using the JWKS endpoint, falling back to DB keys.
 */
export async function verifyJwtToken(token: string): Promise<any | null> {
  try {
    const { jwtVerify } = await getJose();
    const JWKS = await getRemoteJWKS();
    const result = await jwtVerify(token, JWKS);
    return result.payload;
  } catch (err: any) {
    // If the token is intrinsically expired, malformed, or has an invalid claim, fail immediately
    if (
      err?.code === "ERR_JWT_EXPIRED" ||
      err?.code === "ERR_JWS_INVALID" ||
      err?.code === "ERR_JWT_CLAIM_VALIDATION_FAILED"
    ) {
      return null;
    }

    // Attempt database fallback in case the frontend JWKS endpoint is unreachable or rotating
    const payload = await verifyWithDbJwks(token);
    if (payload) {
      return payload;
    }
    return null;
  }
}

/**
 * Finds a user in MongoDB by their subject ID (which can be an ObjectId or string ID).
 */
export async function findDbUser(sub: string): Promise<Document | null> {
  const userFilter: Filter<Document> = ObjectId.isValid(sub)
    ? {
        $or: [{ _id: new ObjectId(sub) }, { id: sub }],
      }
    : { id: sub };

  return await usersCollection().findOne(userFilter);
}

/**
 * Formats a raw user document into a typed AuthUser.
 */
function toAuthUser(doc: Document): AuthUser {
  return {
    _id: doc._id instanceof ObjectId ? doc._id : new ObjectId(doc._id),
    id: doc._id?.toString() || doc.id?.toString() || "",
    name: doc.name || "",
    email: doc.email || "",
    role: doc.role as "customer" | "vendor" | "admin",
    status: doc.status,
    subscriptionPlan: doc.subscriptionPlan || "free",
    subscriptionExpiresAt: doc.subscriptionExpiresAt,
    businessName: doc.businessName,
    image: doc.image,
  };
}

/**
 * Reusable Express authentication middleware.
 * Verifies the JWT Bearer token against JWKS and validates the current DB user state.
 */
export async function verifyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "Unauthorized. Authentication token is required.",
      });
      return;
    }

    const token = authHeader.split(" ")[1]?.trim();

    if (!token) {
      res.status(401).json({
        success: false,
        message: "Unauthorized. Bearer token is empty.",
      });
      return;
    }

    const payload = await verifyJwtToken(token);

    if (!payload || !payload.sub) {
      res.status(401).json({
        success: false,
        message: "Unauthorized. Invalid or expired authentication token.",
      });
      return;
    }

    const userDoc = await findDbUser(payload.sub);

    if (!userDoc) {
      res.status(401).json({
        success: false,
        message: "Unauthorized. User account no longer exists.",
      });
      return;
    }

    // Check account status: blocked or inactive users must be denied
    if (userDoc.status === "blocked" || userDoc.status === "inactive") {
      res.status(403).json({
        success: false,
        message: `Forbidden. Your account is currently ${userDoc.status}.`,
      });
      return;
    }

    // Validate account role
    const validRoles = new Set(["customer", "vendor", "admin"]);
    if (!userDoc.role || !validRoles.has(userDoc.role)) {
      res.status(403).json({
        success: false,
        message: "Forbidden. Your account has an invalid or unassigned role.",
      });
      return;
    }

    req.user = toAuthUser(userDoc);
    next();
  } catch (error) {
    console.error("Authentication middleware error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during authentication.",
    });
  }
}

/**
 * Optional authentication middleware:
 * Populates req.user if a valid token is provided, but does not block anonymous users.
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1]?.trim();
      if (token) {
        const payload = await verifyJwtToken(token);
        if (payload?.sub) {
          const userDoc = await findDbUser(payload.sub);
          const validRoles = new Set(["customer", "vendor", "admin"]);
          if (
            userDoc &&
            userDoc.role &&
            validRoles.has(userDoc.role) &&
            userDoc.status !== "blocked" &&
            userDoc.status !== "inactive"
          ) {
            req.user = toAuthUser(userDoc);
          }
        }
      }
    }
  } catch {
    // Ignore errors for optional authentication
  }
  next();
}

/**
 * Role-based authorization middleware.
 * Ensures the authenticated user has one of the required roles.
 */
export function requireRole(
  ...allowedRoles: ("customer" | "vendor" | "admin")[]
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Unauthorized. Please sign in to access this resource.",
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: `Forbidden. This operation requires ${allowedRoles.join(" or ")} role.`,
      });
      return;
    }

    next();
  };
}
