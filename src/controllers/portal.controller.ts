import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { CustomError } from "../errors/customError.error";
import { PatientRequest } from "../types/PatientRequest";
import * as portalService from "../services/portal.service";

/**
 * IP para el límite de intentos. En Vercel `req.ip` es la del proxy interno
 * (la app no activa `trust proxy`), y `x-forwarded-for` lo escribe Vercel
 * pisando lo que mande el cliente, así que ahí sí es confiable. Fuera de
 * Vercel la cabecera la puede inventar cualquiera: se usa el socket.
 */
function clientIp(req: Request): string {
  if (env.IS_VERCEL) {
    const forwarded = String(req.headers["x-forwarded-for"] ?? "")
      .split(",")[0]
      .trim();
    const realIp = String(req.headers["x-real-ip"] ?? "").trim();
    if (forwarded || realIp) return forwarded || realIp;
  }
  return req.ip || req.socket.remoteAddress || "desconocida";
}

/** GET /api/portal/config */
export function config(_req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(portalService.getConfig());
  } catch (error) {
    next(error);
  }
}

/** POST /api/portal/lookup — body: { cedula, birthDate? } */
export async function lookup(req: Request, res: Response, next: NextFunction) {
  try {
    const { cedula, birthDate } = req.body ?? {};
    // Los resultados llevan el token del paciente: que ningún intermediario los guarde.
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(await portalService.lookup({ cedula, birthDate, ip: clientIp(req) }));
  } catch (error) {
    next(error);
  }
}

/** GET /api/portal/studies */
export async function listStudies(req: PatientRequest, res: Response, next: NextFunction) {
  try {
    if (!req.patientId) throw new CustomError("No autorizado", 401);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(await portalService.listStudies(req.patientId));
  } catch (error) {
    next(error);
  }
}

/** GET /api/portal/studies/:id/download */
export async function download(req: PatientRequest, res: Response, next: NextFunction) {
  try {
    if (!req.patientId) throw new CustomError("No autorizado", 401);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(await portalService.getDownload(req.patientId, req.params.id));
  } catch (error) {
    next(error);
  }
}
