import { Response, NextFunction } from "express";
import { CustomError } from "../errors/customError.error";
import { AuthRequest } from "../types/AuthRequest";
import * as studyService from "../services/study.service";

/** POST /api/studies/upload-signature — body: { patientId } */
export async function uploadSignature(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await studyService.createUploadSignature(req.body?.patientId));
  } catch (error) {
    next(error);
  }
}

/** POST /api/studies — registra un archivo ya subido a Cloudinary */
export async function create(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new CustomError("No autorizado", 401);
    res.status(201).json(await studyService.createStudy(req.body, req.user.userId));
  } catch (error) {
    next(error);
  }
}

/** PUT /api/studies/:id */
export async function update(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await studyService.updateStudy(req.params.id, req.body));
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/studies/:id */
export async function remove(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await studyService.deleteStudy(req.params.id));
  } catch (error) {
    next(error);
  }
}

/** GET /api/studies/:id/download — URL firmada, vence en 5 min */
export async function download(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await studyService.getStaffDownload(req.params.id));
  } catch (error) {
    next(error);
  }
}

/** POST /api/studies/:id/notify — reenvía el correo de aviso */
export async function notify(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await studyService.notifyStudy(req.params.id));
  } catch (error) {
    next(error);
  }
}
