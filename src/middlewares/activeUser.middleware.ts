import mongoose from "mongoose";
import { Response, NextFunction } from "express";
import { User } from "../models/user.model";
import { AuthRequest } from "../types/AuthRequest";

/**
 * El token del personal dura 30 días y authMiddleware solo mira la firma:
 * sin esto, un asesor desactivado (o un admin degradado) seguiría viendo datos
 * de pacientes hasta que venza su token. Se consulta la cuenta en cada
 * petición y el rol sale de la base, no del token.
 * Va después de authMiddleware y antes de los gates de rol.
 */
export async function activeUserMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    const user =
      userId && mongoose.isValidObjectId(userId)
        ? await User.findById(userId).select("isActive accountType")
        : null;

    if (!req.user || !user || !user.isActive) {
      res.status(401).json({ message: "Tu sesión ya no es válida. Inicia sesión de nuevo." });
      return;
    }

    req.user.accountType = user.accountType;
    next();
  } catch (error) {
    next(error);
  }
}
