import { Request, Response, NextFunction } from "express";
import * as patientService from "../services/patient.service";
import * as studyService from "../services/study.service";

/** GET /api/patients — query: search, status, page, limit */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { search, status, page, limit } = req.query;
    res.status(200).json(await patientService.listPatients({ search, status, page, limit }));
  } catch (error) {
    next(error);
  }
}

/** POST /api/patients */
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await patientService.createPatient(req.body));
  } catch (error) {
    next(error);
  }
}

/** GET /api/patients/:id */
export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await patientService.getPatient(req.params.id));
  } catch (error) {
    next(error);
  }
}

/** PUT /api/patients/:id — campos parciales */
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await patientService.updatePatient(req.params.id, req.body));
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/patients/:id — solo admin */
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await patientService.deletePatient(req.params.id));
  } catch (error) {
    next(error);
  }
}

/** GET /api/patients/:id/studies */
export async function listStudies(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await studyService.listByPatient(req.params.id));
  } catch (error) {
    next(error);
  }
}
