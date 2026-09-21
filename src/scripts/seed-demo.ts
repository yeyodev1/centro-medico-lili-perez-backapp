/**
 * Seed script — crea (o actualiza) un paciente de demostración con un estudio.
 *
 * Los datos NO viven en el repo: llegan en un JSON aparte, porque el paciente
 * de demostración del cliente es una persona real. El formato está en
 * seed-demo.example.json.
 *
 * Uso: ts-node-dev --transpile-only src/scripts/seed-demo.ts <datos.json> <archivo-del-estudio>
 *
 * Es idempotente: busca al paciente por cédula y al estudio por paciente +
 * número de examen, así que correrlo dos veces no duplica nada ni vuelve a
 * subir el archivo.
 */
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { env } from "../config/env";
import { Patient } from "../models/patient.model";
import { Study } from "../models/study.model";
import { User } from "../models/user.model";
import * as cloudinaryService from "../services/cloudinary.service";
import { normalizeCedula } from "../services/patient.service";
import { parseDate } from "../utils/validation";

interface DemoData {
  patient: Record<string, unknown> & { cedula: string; fullName: string };
  study: {
    type: string;
    title: string;
    examNumber: string;
    doctor?: string;
    studyDate: string;
    notes?: string;
  };
}

function readData(jsonPath: string): DemoData {
  const data = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as DemoData;
  if (!data?.patient?.cedula || !data?.patient?.fullName) {
    throw new Error("El JSON necesita patient.cedula y patient.fullName");
  }
  if (!data?.study?.title || !data?.study?.type || !data?.study?.studyDate) {
    throw new Error("El JSON necesita study.type, study.title y study.studyDate");
  }
  return data;
}

async function main() {
  const [jsonArg, fileArg] = process.argv.slice(2);
  if (!jsonArg || !fileArg) {
    console.error("✖ Uso: seed-demo.ts <datos.json> <archivo-del-estudio>");
    process.exit(1);
  }

  const jsonPath = path.resolve(jsonArg);
  const filePath = path.resolve(fileArg);
  for (const file of [jsonPath, filePath]) {
    if (!fs.existsSync(file)) {
      console.error(`✖ No existe el archivo: ${file}`);
      process.exit(1);
    }
  }

  const data = readData(jsonPath);
  const cedula = normalizeCedula(data.patient.cedula);

  console.log("Conectando a MongoDB...");
  await mongoose.connect(env.DB_URI);

  const fields = {
    ...data.patient,
    cedula,
    admissionDate: parseDate(data.patient.admissionDate, "admissionDate"),
    birthDate: parseDate(data.patient.birthDate, "birthDate"),
  };

  let patient = await Patient.findOne({ cedula });
  if (patient) {
    patient.set(fields);
    await patient.save();
    console.log(`✔ Paciente demo actualizado (${patient._id})`);
  } else {
    patient = await Patient.create(fields);
    console.log(`✔ Paciente demo creado (${patient._id})`);
  }

  const examNumber = String(data.study.examNumber ?? "");
  const existing = await Study.findOne({ patientId: patient._id, examNumber });
  if (existing) {
    console.log(`✔ El estudio demo ya existía (${existing._id}); no se vuelve a subir el archivo`);
  } else {
    console.log("Subiendo el archivo a Cloudinary (authenticated)...");
    const resource = await cloudinaryService.uploadPrivateFile(
      filePath,
      cloudinaryService.patientFolder(patient._id.toString()),
    );

    const admin = await User.findOne({ email: env.ADMIN_EMAIL });
    const study = await Study.create({
      patientId: patient._id,
      type: data.study.type,
      title: data.study.title,
      examNumber,
      doctor: data.study.doctor ?? "",
      studyDate: parseDate(data.study.studyDate, "studyDate"),
      notes: data.study.notes ?? "",
      file: {
        publicId: resource.publicId,
        resourceType: resource.resourceType,
        originalName: path.basename(filePath),
        format: resource.format,
        bytes: resource.bytes,
      },
      uploadedBy: admin?._id ?? null,
    });
    console.log(
      `✔ Estudio demo creado (${study._id}) — ${resource.format}, ${resource.bytes} bytes`,
    );
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("✖ Falló el seed:", error?.message ?? error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
