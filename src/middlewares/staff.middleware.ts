import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/AuthRequest";

/** Personal del centro: asesores y administración. Va siempre después de authMiddleware. */
export function staffMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const type = req.user?.accountType;
  if (type !== "staff" && type !== "admin") {
    res.status(403).json({ message: "No tienes permiso para ver esto" });
    return;
  }
  next();
}
