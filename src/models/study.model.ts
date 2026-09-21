import mongoose, { Schema, Types } from "mongoose";

export const STUDY_TYPES = ["laboratorio", "imagen", "otro"] as const;
export type StudyType = (typeof STUDY_TYPES)[number];

export const RESOURCE_TYPES = ["image", "raw"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export interface IStudyFile {
  // publicId y resourceType son internos: nunca salen en una respuesta.
  publicId: string;
  resourceType: ResourceType;
  originalName: string;
  format: string;
  bytes: number;
}

export interface IStudy {
  patientId: Types.ObjectId;
  type: StudyType;
  title: string;
  examNumber: string;
  doctor: string;
  studyDate: Date;
  notes: string;
  file: IStudyFile;
  isVisible: boolean;
  downloadCount: number;
  lastDownloadedAt: Date | null;
  notifiedAt: Date | null;
  uploadedBy: Types.ObjectId | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const studySchema = new Schema<IStudy>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    type: { type: String, enum: STUDY_TYPES, required: true },
    title: { type: String, required: true, trim: true },
    examNumber: { type: String, default: "", trim: true },
    doctor: { type: String, default: "", trim: true },
    studyDate: { type: Date, required: true },
    notes: { type: String, default: "", trim: true },
    file: {
      // Único: un mismo archivo no puede quedar colgado de dos estudios.
      publicId: { type: String, required: true, unique: true },
      resourceType: { type: String, enum: RESOURCE_TYPES, required: true },
      originalName: { type: String, default: "" },
      format: { type: String, required: true },
      bytes: { type: Number, required: true },
    },
    isVisible: { type: Boolean, default: true },
    downloadCount: { type: Number, default: 0 },
    lastDownloadedAt: { type: Date, default: null },
    notifiedAt: { type: Date, default: null },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

studySchema.index({ patientId: 1, studyDate: -1 });
studySchema.index({ createdAt: -1 });

export const Study = mongoose.models.Study || mongoose.model<IStudy>("Study", studySchema);
