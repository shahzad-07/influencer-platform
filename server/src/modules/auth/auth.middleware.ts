import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type Role = "BRAND" | "INFLUENCER";
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

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  try {
    req.user = jwt.verify(
      header.slice(7),
      process.env.JWT_SECRET as string,
    ) as AuthPayload;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
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
