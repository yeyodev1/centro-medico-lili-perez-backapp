import { env } from "../config/env";
import { layout, sendEmail } from "./email.service";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Aviso de resultados listos. El correo NO lleva el archivo ni ningún dato
 * clínico (ni el tipo de examen): un buzón no es un lugar seguro para eso.
 * Solo invita a entrar al portal con la cédula.
 */
export async function sendResultsReadyEmail(patient: {
  email: string;
  fullName: string;
}): Promise<boolean> {
  if (!patient.email) return false;

  const url = `${env.FRONTEND_URL.replace(/\/+$/, "")}/resultados`;
  const body = `
    <p>Hola, <strong>${escapeHtml(patient.fullName)}</strong>:</p>
    <p>Ya puedes consultar y descargar tus resultados en nuestro portal. Solo necesitas tu número de cédula.</p>
    <p style="margin:28px 0">
      <a href="${url}" style="background:#1d3fa6;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:bold;display:inline-block">Ver mis resultados</a>
    </p>
    <p style="color:#52525b;font-size:13px">Si el botón no funciona, copia este enlace en tu navegador:<br>${url}</p>
    <p style="color:#52525b;font-size:13px">Por tu seguridad no enviamos resultados por correo. Si no esperabas este mensaje, comunícate con el centro médico.</p>`;

  return sendEmail(
    patient.email,
    "Tus resultados ya están disponibles",
    layout("Tus resultados ya están disponibles", body),
  );
}
