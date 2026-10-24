import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UserModel } from "../users/user.model";

export type Role = "ADMIN" | "BRAND" | "INFLUENCER";
export interface AuthPayload {
  userId: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(
      header.slice(7),
      process.env.JWT_SECRET as string,
    );
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  if (typeof payload === "string" || typeof payload.userId !== "string") {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  try {
    const user = await UserModel.findById(payload.userId).select("role accountStatus");
    if (!user) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
    if (user.accountStatus !== "ACTIVE") {
      return res.status(401).json({
        code: "ACCOUNT_INACTIVE",
        message: "This account is suspended or removed. Contact support if you believe this is a mistake.",
      });
    }

    req.user = { userId: user.id, role: user.role as Role };
    next();
  } catch {
    return res.status(503).json({ message: "Could not verify account status. Please retry." });
  }
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
