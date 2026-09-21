import express, { Application } from "express";
import authRoutes from "./auth.routes";
import dashboardRoutes from "./dashboard.routes";
import healthRoutes from "./health.routes";
import patientRoutes from "./patient.routes";
import portalRoutes from "./portal.routes";
import studyRoutes from "./study.routes";
import userRoutes from "./user.routes";

function routerApi(app: Application) {
  const router = express.Router();
  app.use("/api", router);

  router.use("/health", healthRoutes);
  router.use("/auth", authRoutes);

  // Portal público de pacientes: consulta por cédula.
  router.use("/portal", portalRoutes);

  // Panel del personal (asesores y administración).
  router.use("/dashboard", dashboardRoutes);
  router.use("/patients", patientRoutes);
  router.use("/studies", studyRoutes);
  router.use("/users", userRoutes);
}

export default routerApi;
