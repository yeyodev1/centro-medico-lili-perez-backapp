import mongoose from "mongoose";
import { CustomError } from "../errors/customError.error";

/** Un id mal formado es un 404 del cliente, no un CastError 500 nuestro. */
export function assertObjectId(id: unknown, notFoundMessage: string): string {
  const value = String(id ?? "");
  if (!mongoose.isValidObjectId(value) || value.length !== 24) {
    throw new CustomError(notFoundMessage, 404);
  }
  return value;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Texto libre: siempre string, sin espacios sobrantes. */
export function cleanText(value: unknown, max = 500): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, max);
}

/** Sin tildes y en minúsculas: "Pérez  LEÓN" → "perez leon". */
export function toSearchText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Acepta "YYYY-MM-DD" o ISO completo. Vacío o null → null.
 * Una fecha sin hora se guarda a medianoche UTC para que el día no se corra
 * según la zona horaria del servidor.
 */
export function parseDate(value: unknown, label: string): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T00:00:00.000Z`)
    : new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new CustomError(`${label}: fecha inválida`, 400);
  }
  return date;
}

export function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  const text = String(value ?? "").trim() as T;
  if (!allowed.includes(text)) {
    throw new CustomError(`${label}: valor no permitido`, 400);
  }
  return text;
}

export function parseBoolean(value: unknown): boolean {
  return value === true || value === "true";
}
