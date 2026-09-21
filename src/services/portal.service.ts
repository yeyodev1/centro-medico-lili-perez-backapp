import { env } from "../config/env";
import { CustomError } from "../errors/customError.error";
import { LOOKUP_WINDOW_SECONDS, LookupAttempt } from "../models/lookupAttempt.model";
import { Patient } from "../models/patient.model";
import { Study } from "../models/study.model";
import { PATIENT_TOKEN_TTL_SECONDS, signPatientToken } from "../utils/patientToken";
import { assertObjectId } from "../utils/validation";
import { normalizeCedula } from "./patient.service";
import { buildDownload } from "./study.service";

const MAX_ATTEMPTS = 10;
const STUDY_NOT_FOUND = "Estudio no encontrado";
const SESSION_EXPIRED = "Tu sesión expiró. Vuelve a consultar con tu número de cédula.";

// Un solo mensaje para "no existe", "inactivo" y "fecha incorrecta": el portal
// no debe servir para averiguar qué cédulas son pacientes del centro.
const LOOKUP_NOT_FOUND =
  "No encontramos resultados con esos datos. Verifica tu número de cédula o comunícate con el centro médico.";

export interface PortalStudyDto {
  id: string;
  type: string;
  title: string;
  examNumber: string;
  doctor: string;
  studyDate: string;
  file: { format: string; bytes: number };
}

function serializePortalStudy(study: any): PortalStudyDto {
  return {
    id: study._id.toString(),
    type: study.type,
    title: study.title,
    examNumber: study.examNumber || "",
    doctor: study.doctor || "",
    studyDate: new Date(study.studyDate).toISOString(),
    file: { format: study.file.format, bytes: study.file.bytes },
  };
}

/** "0912345678" → "09******78" */
function maskCedula(cedula: string): string {
  if (cedula.length <= 4) return "*".repeat(cedula.length);
  return `${cedula.slice(0, 2)}${"*".repeat(cedula.length - 4)}${cedula.slice(-2)}`;
}

export function getConfig(): { requireBirthDate: boolean } {
  return { requireBirthDate: env.PORTAL_REQUIRE_BIRTHDATE };
}

/**
 * Cuenta TODA consulta, acierte o no: también frena a quien ya tiene una
 * lista de cédulas válidas y quiere recorrerla. El filtro por fecha es
 * explícito porque el barrido TTL de Mongo corre cada ~60 s, no al instante.
 */
async function registerAttempt(ip: string): Promise<void> {
  const since = new Date(Date.now() - LOOKUP_WINDOW_SECONDS * 1000);
  const attempts = await LookupAttempt.countDocuments({ ip, createdAt: { $gte: since } });
  if (attempts >= MAX_ATTEMPTS) {
    throw new CustomError("Demasiados intentos. Espera unos minutos e inténtalo de nuevo.", 429);
  }
  await LookupAttempt.create({ ip });
}

async function visibleStudies(patientId: unknown): Promise<PortalStudyDto[]> {
  const studies = await Study.find({ patientId, isVisible: true }).sort({
    studyDate: -1,
    createdAt: -1,
  });
  return studies.map(serializePortalStudy);
}

export async function lookup(input: { cedula: unknown; birthDate: unknown; ip: string }) {
  await registerAttempt(input.ip);

  const cedula = normalizeCedula(input.cedula);
  if (!cedula) throw new CustomError("Escribe tu número de cédula", 400);

  const birthDate = String(input.birthDate ?? "").trim();
  if (env.PORTAL_REQUIRE_BIRTHDATE && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new CustomError("Escribe tu fecha de nacimiento", 400);
  }

  const notFound = new CustomError(LOOKUP_NOT_FOUND, 404);

  // Una cédula con formato imposible ni se busca, pero responde igual que una inexistente.
  if (!/^[A-Z0-9]{5,20}$/.test(cedula)) throw notFound;

  const patient = await Patient.findOne({ cedula });
  if (!patient || patient.status !== "active") throw notFound;

  if (env.PORTAL_REQUIRE_BIRTHDATE) {
    const stored = patient.birthDate ? patient.birthDate.toISOString().slice(0, 10) : "";
    if (!stored || stored !== birthDate) throw notFound;
  }

  return {
    token: signPatientToken(patient._id.toString()),
    expiresIn: PATIENT_TOKEN_TTL_SECONDS,
    patient: { fullName: patient.fullName, cedulaMasked: maskCedula(patient.cedula) },
    studies: await visibleStudies(patient._id),
  };
}

/** El token dura 15 min, pero si en ese rato desactivan al paciente, se corta. */
async function assertActivePatient(patientId: string) {
  const id = assertObjectId(patientId, SESSION_EXPIRED);
  const patient = await Patient.findById(id).select("status");
  if (!patient || patient.status !== "active") throw new CustomError(SESSION_EXPIRED, 401);
  return patient;
}

export async function listStudies(patientId: string): Promise<PortalStudyDto[]> {
  const patient = await assertActivePatient(patientId);
  return visibleStudies(patient._id);
}

export async function getDownload(
  patientId: string,
  studyId: unknown,
): Promise<{ url: string; filename: string }> {
  const patient = await assertActivePatient(patientId);
  const id = assertObjectId(studyId, STUDY_NOT_FOUND);

  // El filtro lleva patientId e isVisible: un estudio ajeno u oculto es un 404
  // idéntico al de uno que no existe.
  const study = await Study.findOneAndUpdate(
    { _id: id, patientId: patient._id, isVisible: true },
    { $inc: { downloadCount: 1 }, $set: { lastDownloadedAt: new Date() } },
    { new: true },
  );
  if (!study) throw new CustomError(STUDY_NOT_FOUND, 404);

  return buildDownload(study);
}
