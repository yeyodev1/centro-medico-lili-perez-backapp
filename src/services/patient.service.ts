import mongoose from "mongoose";
import { CustomError } from "../errors/customError.error";
import {
  BLOOD_TYPES,
  ID_TYPES,
  MARITAL_STATUSES,
  PATIENT_STATUSES,
  Patient,
  SEXES,
} from "../models/patient.model";
import { Study } from "../models/study.model";
import {
  assertObjectId,
  cleanText,
  escapeRegex,
  parseBoolean,
  parseDate,
  parseEnum,
  toSearchText,
} from "../utils/validation";
import * as cloudinaryService from "./cloudinary.service";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CEDULA = /^[A-Z0-9]{5,20}$/;
const NOT_FOUND = "Paciente no encontrado";
const MAX_LIMIT = 100;

export interface PatientDto {
  id: string;
  clinicalHistory: string;
  idType: string;
  isForeigner: boolean;
  cedula: string;
  fullName: string;
  maritalStatus: string;
  address: string;
  email: string;
  sex: string;
  bloodType: string;
  status: string;
  admissionDate: string | null;
  birthDate: string | null;
  origin: string;
  sector: string;
  landline: string;
  mobile1: string;
  mobile2: string;
  notes: string;
  studiesCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Sin espacios ni guiones y en mayúsculas: así se guarda y así se busca. */
export function normalizeCedula(value: unknown): string {
  return String(value ?? "")
    .replace(/[\s-]/g, "")
    .toUpperCase();
}

function iso(value: Date | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function serializePatient(patient: any, studiesCount = 0): PatientDto {
  return {
    id: patient._id.toString(),
    clinicalHistory: patient.clinicalHistory || "",
    idType: patient.idType,
    isForeigner: !!patient.isForeigner,
    cedula: patient.cedula,
    fullName: patient.fullName,
    maritalStatus: patient.maritalStatus || "",
    address: patient.address || "",
    email: patient.email || "",
    sex: patient.sex || "",
    bloodType: patient.bloodType || "S/E",
    status: patient.status,
    admissionDate: iso(patient.admissionDate),
    birthDate: iso(patient.birthDate),
    origin: patient.origin || "",
    sector: patient.sector || "",
    landline: patient.landline || "",
    mobile1: patient.mobile1 || "",
    mobile2: patient.mobile2 || "",
    notes: patient.notes || "",
    studiesCount,
    createdAt: iso(patient.createdAt) as string,
    updatedAt: iso(patient.updatedAt) as string,
  };
}

/**
 * Valida solo los campos presentes en el body, para servir igual a POST y a
 * PUT parcial. No se valida dígito verificador: hay extranjeros y pasaportes.
 */
function parseFields(body: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const has = (key: string) => body[key] !== undefined;

  if (has("cedula")) {
    const cedula = normalizeCedula(body.cedula);
    if (!CEDULA.test(cedula)) {
      throw new CustomError(
        "La identificación debe tener entre 5 y 20 caracteres, solo letras y números",
        400,
      );
    }
    data.cedula = cedula;
  }
  if (has("fullName")) {
    const fullName = cleanText(body.fullName, 200).toUpperCase();
    if (fullName.length < 3) throw new CustomError("Escribe los apellidos y nombres", 400);
    data.fullName = fullName;
  }
  if (has("clinicalHistory")) {
    data.clinicalHistory = cleanText(body.clinicalHistory, 40).toUpperCase();
  }
  if (has("email")) {
    const email = cleanText(body.email, 200).toLowerCase();
    if (email && !EMAIL.test(email)) throw new CustomError("Correo inválido", 400);
    data.email = email;
  }
  if (has("idType")) data.idType = parseEnum(body.idType, ID_TYPES, "Tipo de identificación");
  if (has("sex")) data.sex = parseEnum(body.sex, SEXES, "Sexo");
  if (has("maritalStatus")) {
    data.maritalStatus = parseEnum(body.maritalStatus, MARITAL_STATUSES, "Estado civil");
  }
  if (has("bloodType")) data.bloodType = parseEnum(body.bloodType, BLOOD_TYPES, "Tipo de sangre");
  if (has("status")) data.status = parseEnum(body.status, PATIENT_STATUSES, "Estado");
  if (has("isForeigner")) data.isForeigner = parseBoolean(body.isForeigner);
  if (has("admissionDate")) data.admissionDate = parseDate(body.admissionDate, "Fecha de ingreso");
  if (has("birthDate")) {
    const birthDate = parseDate(body.birthDate, "Fecha de nacimiento");
    if (birthDate && birthDate.getTime() > Date.now()) {
      throw new CustomError("La fecha de nacimiento no puede ser futura", 400);
    }
    data.birthDate = birthDate;
  }
  for (const key of ["address", "origin", "sector", "notes"] as const) {
    if (has(key)) data[key] = cleanText(body[key], key === "notes" ? 2000 : 300);
  }
  for (const key of ["landline", "mobile1", "mobile2"] as const) {
    if (has(key)) data[key] = cleanText(body[key], 30);
  }

  return data;
}

async function assertUnique(data: Record<string, unknown>, exceptId?: string) {
  const except = exceptId ? { _id: { $ne: exceptId } } : {};
  if (data.cedula && (await Patient.exists({ cedula: data.cedula, ...except }))) {
    throw new CustomError("Ya existe un paciente con esa cédula", 409);
  }
  if (
    data.clinicalHistory &&
    (await Patient.exists({ clinicalHistory: data.clinicalHistory, ...except }))
  ) {
    throw new CustomError("Ya existe un paciente con esa historia clínica", 409);
  }
}

/** Dos altas simultáneas pasan assertUnique: el índice único es la red final. */
function translateDuplicate(error: any): never {
  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern || error.keyValue || {})[0];
    throw new CustomError(
      field === "clinicalHistory"
        ? "Ya existe un paciente con esa historia clínica"
        : "Ya existe un paciente con esa cédula",
      409,
    );
  }
  throw error;
}

async function countStudies(ids: mongoose.Types.ObjectId[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const rows = await Study.aggregate([
    { $match: { patientId: { $in: ids } } },
    { $group: { _id: "$patientId", total: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id.toString(), row.total]));
}

function buildSearchFilter(search: string): Record<string, unknown> | null {
  const text = cleanText(search, 100);
  if (!text) return null;

  const or: Record<string, unknown>[] = [];

  const words = toSearchText(text).split(" ").filter(Boolean);
  if (words.length) {
    // Todas las palabras, en cualquier orden: "maria perez" encuentra
    // "PÉREZ LEÓN MARÍA".
    or.push({ $and: words.map((word) => ({ searchName: new RegExp(escapeRegex(word)) })) });
  }

  const code = normalizeCedula(text);
  if (/^[A-Z0-9]+$/.test(code)) {
    const prefix = new RegExp(`^${escapeRegex(code)}`);
    or.push({ cedula: prefix }, { clinicalHistory: prefix });
  }

  return or.length ? { $or: or } : null;
}

export async function listPatients(query: {
  search?: unknown;
  status?: unknown;
  page?: unknown;
  limit?: unknown;
}): Promise<{ items: PatientDto[]; total: number; page: number; pages: number }> {
  const page = Math.max(1, Math.floor(Number(query.page)) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(query.limit)) || 20));

  const filter: Record<string, unknown> = {};
  const status = String(query.status ?? "");
  if (status) filter.status = parseEnum(status, PATIENT_STATUSES, "Estado");

  const search = buildSearchFilter(String(query.search ?? ""));
  if (search) Object.assign(filter, search);

  const [patients, total] = await Promise.all([
    Patient.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Patient.countDocuments(filter),
  ]);

  const counts = await countStudies(patients.map((patient: any) => patient._id));

  return {
    items: patients.map((patient: any) =>
      serializePatient(patient, counts.get(patient._id.toString()) || 0),
    ),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

/** Documento Mongoose del paciente, o 404. Lo reutilizan otros services. */
export async function findPatientOrFail(id: unknown) {
  const patientId = assertObjectId(id, NOT_FOUND);
  const patient = await Patient.findById(patientId);
  if (!patient) throw new CustomError(NOT_FOUND, 404);
  return patient;
}

export async function getPatient(id: unknown): Promise<PatientDto> {
  const patient = await findPatientOrFail(id);
  const total = await Study.countDocuments({ patientId: patient._id });
  return serializePatient(patient, total);
}

export async function createPatient(body: Record<string, unknown>): Promise<PatientDto> {
  const data = parseFields(body ?? {});
  if (!data.cedula) throw new CustomError("La cédula es obligatoria", 400);
  if (!data.fullName) throw new CustomError("Los apellidos y nombres son obligatorios", 400);

  await assertUnique(data);

  try {
    const patient = await Patient.create(data);
    return serializePatient(patient, 0);
  } catch (error) {
    translateDuplicate(error);
  }
}

export async function updatePatient(
  id: unknown,
  body: Record<string, unknown>,
): Promise<PatientDto> {
  const patient = await findPatientOrFail(id);
  const data = parseFields(body ?? {});

  await assertUnique(data, patient._id.toString());

  // set + save (no findByIdAndUpdate): así corre el hook que recalcula searchName.
  patient.set(data);
  try {
    await patient.save();
  } catch (error) {
    translateDuplicate(error);
  }

  const total = await Study.countDocuments({ patientId: patient._id });
  return serializePatient(patient, total);
}

/**
 * Borra al paciente con todos sus estudios. Primero los archivos: si
 * Cloudinary falla se corta acá y no queda un PDF huérfano sin registro que
 * lo señale. Reintentar es seguro.
 */
export async function deletePatient(id: unknown): Promise<{ ok: true }> {
  const patient = await findPatientOrFail(id);
  const studies = await Study.find({ patientId: patient._id });

  for (const study of studies) {
    await cloudinaryService.deletePrivateResource(study.file.publicId, study.file.resourceType);
    await study.deleteOne();
  }

  await patient.deleteOne();
  if (studies.length) await cloudinaryService.deletePatientFolder(patient._id.toString());

  return { ok: true };
}
