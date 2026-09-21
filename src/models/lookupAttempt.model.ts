import mongoose, { Schema } from "mongoose";

/** Ventana del límite de intentos del portal, en segundos. */
export const LOOKUP_WINDOW_SECONDS = 15 * 60;

export interface ILookupAttempt {
  ip: string;
  createdAt: Date;
}

/**
 * Un documento por consulta al portal. En Vercel la memoria no sobrevive
 * entre invocaciones, así que el contador vive en Mongo y el índice TTL lo
 * limpia solo.
 */
const lookupAttemptSchema = new Schema<ILookupAttempt>({
  ip: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now, expires: LOOKUP_WINDOW_SECONDS },
});

export const LookupAttempt =
  mongoose.models.LookupAttempt ||
  mongoose.model<ILookupAttempt>("LookupAttempt", lookupAttemptSchema);
