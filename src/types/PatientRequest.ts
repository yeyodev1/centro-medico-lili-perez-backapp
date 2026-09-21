import { Request } from "express";

export interface PatientJwtPayload {
  patientId: string;
  scope: "patient";
}

export interface PatientRequest extends Request {
  patientId?: string;
}
