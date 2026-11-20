
import type { Request } from "express";

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "customer" | "vendor" | "admin";
}

interface AuthSessionResponse {
  user: AuthUser;
  session: {
    id: string;
    userId: string;
  };
}

export const verifyVendor = async (
  req: Request,
): Promise<AuthUser | null> => {
  try {
    const betterAuthUrl = process.env.BETTER_AUTH_URL;

    if (!betterAuthUrl) {
      throw new Error("BETTER_AUTH_URL is not defined");
    }

    const cookie = req.headers.cookie;

    if (!cookie) {
      return null;
    }

    const response = await fetch(
      `${betterAuthUrl}/api/auth/get-session`,
      {
        method: "GET",
        headers: {
          Cookie: cookie,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return null;
    }

    const data =
      (await response.json()) as AuthSessionResponse | null;

    if (!data?.user || !data?.session) {
      return null;
    }

    if (data.user.role !== "vendor") {
      return null;
    }

    return data.user;
  } catch (error) {
    console.error("Vendor session verification failed:", error);
    return null;
  }
};
