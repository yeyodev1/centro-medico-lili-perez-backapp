import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { PatientJwtPayload } from "../types/PatientRequest";

/** Vida del token del paciente, en segundos. */
export const PATIENT_TOKEN_TTL_SECONDS = 15 * 60;

/**
 * Secreto DERIVADO: un token de paciente jamás pasa authMiddleware (que
 * verifica con JWT_SECRET a secas) y uno del personal jamás pasa por acá.
 */
const PATIENT_JWT_SECRET = `${env.JWT_SECRET}:patient`;

export function signPatientToken(patientId: string): string {
  const payload: PatientJwtPayload = { patientId, scope: "patient" };
  return jwt.sign(payload, PATIENT_JWT_SECRET, { expiresIn: PATIENT_TOKEN_TTL_SECONDS });
}

/** Lanza si el token no es válido, venció o no es de paciente. */
export function verifyPatientToken(token: string): PatientJwtPayload {
  const decoded = jwt.verify(token, PATIENT_JWT_SECRET, {
    algorithms: ["HS256"],
  }) as PatientJwtPayload;
  if (decoded.scope !== "patient" || !decoded.patientId) {
    throw new Error("Token sin alcance de paciente");
  }
  return decoded;
}
