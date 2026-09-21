import mongoose, { Schema } from "mongoose";
import { toSearchText } from "../utils/validation";

export const ID_TYPES = ["cedula", "ruc", "pasaporte"] as const;
export const SEXES = ["F", "M", ""] as const;
export const MARITAL_STATUSES = [
  "soltero",
  "casado",
  "divorciado",
  "viudo",
  "union_libre",
  "",
] as const;
// S/E = sin especificar.
export const BLOOD_TYPES = ["S/E", "O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"] as const;
export const PATIENT_STATUSES = ["active", "inactive"] as const;

export type IdType = (typeof ID_TYPES)[number];
export type Sex = (typeof SEXES)[number];
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];
export type BloodType = (typeof BLOOD_TYPES)[number];
export type PatientStatus = (typeof PATIENT_STATUSES)[number];

export interface IPatient {
  clinicalHistory: string;
  idType: IdType;
  isForeigner: boolean;
  cedula: string;
  fullName: string;
  searchName: string;
  maritalStatus: MaritalStatus;
  address: string;
  email: string;
  sex: Sex;
  bloodType: BloodType;
  status: PatientStatus;
  admissionDate: Date | null;
  birthDate: Date | null;
  origin: string;
  sector: string;
  landline: string;
  mobile1: string;
  mobile2: string;
  notes: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const patientSchema = new Schema<IPatient>(
  {
    clinicalHistory: { type: String, default: "", trim: true, uppercase: true },
    idType: { type: String, enum: ID_TYPES, default: "cedula" },
    isForeigner: { type: Boolean, default: false },
    // Normalizada por el service: sin espacios ni guiones, mayúsculas.
    cedula: { type: String, required: true, unique: true, trim: true, uppercase: true },
    fullName: { type: String, required: true, trim: true, uppercase: true },
    // Copia de fullName sin tildes y en minúsculas: la búsqueda no depende de
    // cómo escribió el nombre quien lo registró.
    searchName: { type: String, default: "", index: true },
    maritalStatus: { type: String, enum: MARITAL_STATUSES, default: "" },
    address: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true, lowercase: true },
    sex: { type: String, enum: SEXES, default: "" },
    bloodType: { type: String, enum: BLOOD_TYPES, default: "S/E" },
    status: { type: String, enum: PATIENT_STATUSES, default: "active", index: true },
    admissionDate: { type: Date, default: null },
    birthDate: { type: Date, default: null },
    origin: { type: String, default: "", trim: true },
    sector: { type: String, default: "", trim: true },
    landline: { type: String, default: "", trim: true },
    mobile1: { type: String, default: "", trim: true },
    mobile2: { type: String, default: "", trim: true },
    notes: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

// La historia clínica es opcional: única solo cuando viene. Un índice sparse
// no sirve porque el string vacío también cuenta como valor.
patientSchema.index(
  { clinicalHistory: 1 },
  { unique: true, partialFilterExpression: { clinicalHistory: { $gt: "" } } },
);

patientSchema.pre("validate", function (next) {
  this.searchName = toSearchText(this.fullName || "");
  next();
});

export const Patient =
  mongoose.models.Patient || mongoose.model<IPatient>("Patient", patientSchema);
