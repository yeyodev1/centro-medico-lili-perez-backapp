import { CustomError } from "../errors/customError.error";
import { RESOURCE_TYPES, STUDY_TYPES, Study } from "../models/study.model";
import { slugify } from "../utils/slugify";
import { assertObjectId, cleanText, parseDate, parseEnum } from "../utils/validation";
import * as cloudinaryService from "./cloudinary.service";
import * as notificationService from "./notification.service";
import { findPatientOrFail } from "./patient.service";

const NOT_FOUND = "Estudio no encontrado";
const ALLOWED_FORMATS = ["pdf", "jpg", "jpeg", "png"];
const MAX_BYTES = 20 * 1024 * 1024;

export interface StudyDto {
  id: string;
  patientId: string;
  type: string;
  title: string;
  examNumber: string;
  doctor: string;
  studyDate: string;
  notes: string;
  file: { originalName: string; format: string; bytes: number };
  isVisible: boolean;
  downloadCount: number;
  lastDownloadedAt: string | null;
  notifiedAt: string | null;
  uploadedBy: { id: string; name: string } | null;
  createdAt: string;
}

function iso(value: Date | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

/** Espera `uploadedBy` populado. Jamás incluye publicId ni URL del archivo. */
export function serializeStudy(study: any): StudyDto {
  const uploader = study.uploadedBy;
  return {
    id: study._id.toString(),
    patientId: (study.patientId?._id ?? study.patientId).toString(),
    type: study.type,
    title: study.title,
    examNumber: study.examNumber || "",
    doctor: study.doctor || "",
    studyDate: iso(study.studyDate) as string,
    notes: study.notes || "",
    file: {
      originalName: study.file.originalName || "",
      format: study.file.format,
      bytes: study.file.bytes,
    },
    isVisible: !!study.isVisible,
    downloadCount: study.downloadCount || 0,
    lastDownloadedAt: iso(study.lastDownloadedAt),
    notifiedAt: iso(study.notifiedAt),
    uploadedBy:
      uploader && uploader._id ? { id: uploader._id.toString(), name: uploader.name || "" } : null,
    createdAt: iso(study.createdAt) as string,
  };
}

/** Nombre con el que el paciente guarda el archivo: legible y sin datos raros. */
export function downloadFilename(study: any): string {
  const date = new Date(study.studyDate).toISOString().slice(0, 10);
  const base = slugify(study.title) || "resultado";
  return `${base}-${date}.${study.file.format}`;
}

export function buildDownload(study: any): { url: string; filename: string } {
  return {
    url: cloudinaryService.privateDownloadUrl(
      study.file.publicId,
      study.file.format,
      study.file.resourceType,
    ),
    filename: downloadFilename(study),
  };
}

async function findStudyOrFail(id: unknown) {
  const studyId = assertObjectId(id, NOT_FOUND);
  const study = await Study.findById(studyId).populate("uploadedBy", "name");
  if (!study) throw new CustomError(NOT_FOUND, 404);
  return study;
}

function parseFields(body: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const has = (key: string) => body[key] !== undefined;

  if (has("type")) data.type = parseEnum(body.type, STUDY_TYPES, "Tipo de estudio");
  if (has("title")) {
    const title = cleanText(body.title, 200);
    if (!title) throw new CustomError("Escribe el título del estudio", 400);
    data.title = title;
  }
  if (has("studyDate")) {
    const studyDate = parseDate(body.studyDate, "Fecha del estudio");
    if (!studyDate) throw new CustomError("La fecha del estudio es obligatoria", 400);
    data.studyDate = studyDate;
  }
  if (has("examNumber")) data.examNumber = cleanText(body.examNumber, 60);
  if (has("doctor")) data.doctor = cleanText(body.doctor, 200);
  if (has("notes")) data.notes = cleanText(body.notes, 2000);
  if (has("isVisible")) data.isVisible = body.isVisible === true || body.isVisible === "true";

  return data;
}

export async function createUploadSignature(
  patientId: unknown,
): Promise<cloudinaryService.UploadSignature> {
  const patient = await findPatientOrFail(patientId);
  return cloudinaryService.signStudyUpload(patient._id.toString());
}

export async function listByPatient(patientId: unknown): Promise<StudyDto[]> {
  const patient = await findPatientOrFail(patientId);
  const studies = await Study.find({ patientId: patient._id })
    .sort({ studyDate: -1, createdAt: -1 })
    .populate("uploadedBy", "name");
  return studies.map(serializeStudy);
}

/**
 * Registra un archivo que el front ya subió directo a Cloudinary. Nada de lo
 * que diga el front sobre el archivo se da por cierto: se consulta a
 * Cloudinary que existe, que está en la carpeta de ESE paciente, y de ahí
 * salen formato y tamaño.
 */
export async function createStudy(
  body: Record<string, unknown>,
  uploadedBy: string,
): Promise<StudyDto> {
  const input = body ?? {};
  const patient = await findPatientOrFail(input.patientId);

  const data = parseFields(input);
  if (!data.type) throw new CustomError("Elige el tipo de estudio", 400);
  if (!data.title) throw new CustomError("Escribe el título del estudio", 400);
  if (!data.studyDate) throw new CustomError("La fecha del estudio es obligatoria", 400);
  // La visibilidad se cambia después con PUT; un estudio nuevo nace visible.
  delete data.isVisible;

  const file = (input.file ?? {}) as Record<string, unknown>;
  const publicId = String(file.publicId ?? "").trim();
  if (!publicId) throw new CustomError("Falta el archivo del estudio", 400);

  const invalidFile = new CustomError("El archivo no es válido. Súbelo de nuevo.", 400);

  // Fuera de la carpeta del paciente no se toca nada: podría ser el archivo de
  // otro paciente, y borrarlo "por inválido" sería un agujero.
  const folder = `${cloudinaryService.patientFolder(patient._id.toString())}/`;
  if (!publicId.startsWith(folder) || publicId.includes("..")) throw invalidFile;

  if (!RESOURCE_TYPES.includes(file.resourceType as any)) {
    // video u otro tipo: no es pdf/jpg/png. Se intenta limpiar lo que se subió.
    if (file.resourceType === "video") {
      await cloudinaryService.deletePrivateResource(publicId, "video").catch(() => {});
    }
    throw new CustomError("Formato no permitido. Sube un PDF, JPG o PNG.", 400);
  }
  const resourceType = file.resourceType as cloudinaryService.StudyResourceType;

  if (await Study.exists({ "file.publicId": publicId })) {
    throw new CustomError("Ese archivo ya está registrado en otro estudio", 409);
  }

  const resource = await cloudinaryService.getPrivateResource(publicId, resourceType);
  if (!resource || resource.publicId !== publicId) throw invalidFile;

  if (!ALLOWED_FORMATS.includes(resource.format) || resource.bytes > MAX_BYTES) {
    await cloudinaryService.deletePrivateResource(publicId, resourceType).catch(() => {});
    throw new CustomError(
      ALLOWED_FORMATS.includes(resource.format)
        ? "El archivo supera el máximo de 20 MB"
        : "Formato no permitido. Sube un PDF, JPG o PNG.",
      400,
    );
  }

  const study = await Study.create({
    ...data,
    patientId: patient._id,
    file: {
      publicId,
      resourceType,
      originalName: cleanText(file.originalName, 200),
      format: resource.format,
      bytes: resource.bytes,
    },
    uploadedBy,
  });

  if (input.notify === true && patient.email) {
    const sent = await notificationService.sendResultsReadyEmail(patient);
    if (sent) {
      study.notifiedAt = new Date();
      await study.save();
    }
  }

  await study.populate("uploadedBy", "name");
  return serializeStudy(study);
}

export async function updateStudy(id: unknown, body: Record<string, unknown>): Promise<StudyDto> {
  const study = await findStudyOrFail(id);
  study.set(parseFields(body ?? {}));
  await study.save();
  return serializeStudy(study);
}

export async function deleteStudy(id: unknown): Promise<{ ok: true }> {
  const study = await findStudyOrFail(id);
  // Primero el archivo: si Cloudinary falla, el registro sigue ahí para reintentar.
  await cloudinaryService.deletePrivateResource(study.file.publicId, study.file.resourceType);
  await study.deleteOne();
  return { ok: true };
}

/**
 * Descarga desde el panel. No suma a downloadCount: ese contador le dice al
 * asesor si el PACIENTE ya bajó su resultado.
 */
export async function getStaffDownload(id: unknown): Promise<{ url: string; filename: string }> {
  const study = await findStudyOrFail(id);
  return buildDownload(study);
}

export async function notifyStudy(id: unknown): Promise<{ sent: boolean }> {
  const study = await findStudyOrFail(id);
  const patient = await findPatientOrFail(study.patientId);

  if (!patient.email) {
    throw new CustomError("El paciente no tiene un correo registrado", 400);
  }
  if (!study.isVisible) {
    throw new CustomError("El estudio está oculto para el paciente. Hazlo visible primero.", 400);
  }

  const sent = await notificationService.sendResultsReadyEmail(patient);
  if (sent) {
    study.notifiedAt = new Date();
    await study.save();
  }
  return { sent };
}
