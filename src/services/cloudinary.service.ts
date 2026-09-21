import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import { env } from "../config/env";
import { CustomError } from "../errors/customError.error";

let configured = false;

export function isCloudinaryConfigured(): boolean {
  return !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

function ensureConfig() {
  if (configured) return;
  if (!isCloudinaryConfigured()) {
    throw new CustomError("Cloudinary no está configurado en el servidor", 503);
  }
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
  configured = true;
}

const DEFAULT_FOLDER = "centro-medico-lili-perez-backapp";

/** Sube un buffer (multer memoryStorage). */
export function uploadBuffer(
  buffer: Buffer,
  folder = DEFAULT_FOLDER,
): Promise<{ url: string; publicId: string }> {
  ensureConfig();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        transformation: [{ quality: "auto", fetch_format: "auto" }],
      },
      (error, result?: UploadApiResponse) => {
        if (error || !result) return reject(error || new Error("Cloudinary sin respuesta"));
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(buffer);
  });
}

/** Sube un data URI base64 o una URL remota. */
export async function uploadImage(
  source: string,
  folder = DEFAULT_FOLDER,
): Promise<{ url: string; publicId: string }> {
  ensureConfig();
  const result = await cloudinary.uploader.upload(source, {
    folder,
    resource_type: "image",
    transformation: [{ quality: "auto", fetch_format: "auto" }],
  });
  return { url: result.secure_url, publicId: result.public_id };
}

export async function deleteImage(publicId: string): Promise<void> {
  ensureConfig();
  await cloudinary.uploader.destroy(publicId);
}

// ---------------------------------------------------------------------------
// Estudios de pacientes: archivos privados (type "authenticated").
// No tienen URL pública: solo se entregan con una URL firmada que vence.
// ---------------------------------------------------------------------------

export type StudyResourceType = "image" | "raw";

const PATIENTS_ROOT = "centro-medico-lili-perez/pacientes";
const DOWNLOAD_TTL_SECONDS = 5 * 60;

/** Carpeta de Cloudinary de un paciente. El prefijo del publicId la delata. */
export function patientFolder(patientId: string): string {
  return `${PATIENTS_ROOT}/${patientId}`;
}

export interface UploadSignature {
  uploadUrl: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  type: "authenticated";
}

/**
 * Firma una subida directa del navegador a Cloudinary. La firma cubre
 * folder + timestamp + type: el front no puede cambiar la carpeta ni subir
 * el archivo como público sin invalidarla.
 */
export function signStudyUpload(patientId: string): UploadSignature {
  ensureConfig();
  const folder = patientFolder(patientId);
  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { folder, timestamp, type: "authenticated" },
    env.CLOUDINARY_API_SECRET,
  );
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/auto/upload`,
    apiKey: env.CLOUDINARY_API_KEY,
    timestamp,
    signature,
    folder,
    type: "authenticated",
  };
}

export interface PrivateResource {
  publicId: string;
  resourceType: StudyResourceType;
  format: string;
  bytes: number;
}

/** Consulta el recurso en la Admin API. Devuelve null si no existe. */
export async function getPrivateResource(
  publicId: string,
  resourceType: StudyResourceType,
): Promise<PrivateResource | null> {
  ensureConfig();
  try {
    const resource = await cloudinary.api.resource(publicId, {
      resource_type: resourceType,
      type: "authenticated",
    });
    return {
      publicId: resource.public_id,
      resourceType,
      format: String(resource.format || "").toLowerCase(),
      bytes: Number(resource.bytes || 0),
    };
  } catch (error: any) {
    const status = error?.error?.http_code ?? error?.http_code;
    if (status === 404) return null;
    throw new CustomError("No se pudo verificar el archivo en Cloudinary", 502, error?.error);
  }
}

/** Sube un archivo local como privado. Lo usan los scripts, no el API. */
export async function uploadPrivateFile(
  filePath: string,
  folder: string,
): Promise<PrivateResource> {
  ensureConfig();
  const result = await cloudinary.uploader.upload(filePath, {
    folder,
    resource_type: "auto",
    type: "authenticated",
  });
  return {
    publicId: result.public_id,
    resourceType: result.resource_type as StudyResourceType,
    format: String(result.format || "").toLowerCase(),
    bytes: result.bytes,
  };
}

/**
 * URL firmada de descarga que vence en 5 minutos. Pasa por api.cloudinary.com
 * (no por el CDN), así que tampoco queda cacheada en ningún borde.
 */
export function privateDownloadUrl(
  publicId: string,
  format: string,
  resourceType: StudyResourceType,
): string {
  ensureConfig();
  return cloudinary.utils.private_download_url(publicId, format, {
    resource_type: resourceType,
    type: "authenticated",
    attachment: true,
    expires_at: Math.round(Date.now() / 1000) + DOWNLOAD_TTL_SECONDS,
  });
}

/** Borra un archivo privado e invalida cualquier copia en el CDN. */
export async function deletePrivateResource(
  publicId: string,
  resourceType: StudyResourceType | "video",
): Promise<void> {
  ensureConfig();
  try {
    // "not found" no es un error: reintentar un borrado a medias debe funcionar.
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      type: "authenticated",
      invalidate: true,
    });
  } catch (error: any) {
    throw new CustomError("No se pudo borrar el archivo en Cloudinary", 502, error?.error ?? error);
  }
}

/** Quita la carpeta vacía del paciente. Si falla no importa: es solo orden. */
export async function deletePatientFolder(patientId: string): Promise<void> {
  ensureConfig();
  try {
    await cloudinary.api.delete_folder(patientFolder(patientId));
  } catch {
    // La carpeta puede no existir si el paciente nunca tuvo estudios.
  }
}
