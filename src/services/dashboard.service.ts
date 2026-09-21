import { Patient } from "../models/patient.model";
import { Study } from "../models/study.model";
import { StudyDto, serializeStudy } from "./study.service";

const RECENT_LIMIT = 8;
// Ecuador continental no tiene horario de verano: siempre UTC-5.
const GUAYAQUIL_OFFSET_HOURS = 5;

type RecentStudy = StudyDto & { patient: { id: string; fullName: string; cedula: string } };

/** Primer instante del mes en curso según la hora de Guayaquil. */
function startOfMonth(): Date {
  const local = new Date(Date.now() - GUAYAQUIL_OFFSET_HOURS * 3600 * 1000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, GUAYAQUIL_OFFSET_HOURS, 0, 0),
  );
}

export async function getStats(): Promise<{
  patients: number;
  studies: number;
  studiesThisMonth: number;
  downloads: number;
  recentStudies: RecentStudy[];
}> {
  const [patients, studies, studiesThisMonth, downloadRows, recent] = await Promise.all([
    Patient.countDocuments(),
    Study.countDocuments(),
    Study.countDocuments({ createdAt: { $gte: startOfMonth() } }),
    Study.aggregate([{ $group: { _id: null, total: { $sum: "$downloadCount" } } }]),
    Study.find()
      .sort({ createdAt: -1 })
      .limit(RECENT_LIMIT)
      .populate("uploadedBy", "name")
      .populate("patientId", "fullName cedula"),
  ]);

  const recentStudies = recent
    // Un estudio sin paciente no debería existir; si aparece, no rompe el panel.
    .filter((study: any) => study.patientId && study.patientId._id)
    .map((study: any) => ({
      ...serializeStudy(study),
      patient: {
        id: study.patientId._id.toString(),
        fullName: study.patientId.fullName,
        cedula: study.patientId.cedula,
      },
    }));

  return {
    patients,
    studies,
    studiesThisMonth,
    downloads: downloadRows[0]?.total || 0,
    recentStudies,
  };
}
