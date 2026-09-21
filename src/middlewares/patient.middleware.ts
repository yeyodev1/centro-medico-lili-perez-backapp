import { Response, NextFunction } from "express";
import { PatientRequest } from "../types/PatientRequest";
import { verifyPatientToken } from "../utils/patientToken";

const EXPIRED = "Tu sesión expiró. Vuelve a consultar con tu número de cédula.";

/** Sesión corta del paciente en el portal. Deja `req.patientId`. */
export function patientMiddleware(req: PatientRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: EXPIRED });
    return;
  }

  try {
    req.patientId = verifyPatientToken(authHeader.split(" ")[1]).patientId;
    next();
  } catch {
    res.status(401).json({ message: EXPIRED });
    return;
  }
}
