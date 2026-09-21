import { Router } from "express";
import { patientMiddleware } from "../middlewares/patient.middleware";
import * as portalController from "../controllers/portal.controller";

const router = Router();

// Público: el paciente no tiene cuenta, entra con su cédula.
router.get("/config", portalController.config);
router.post("/lookup", portalController.lookup);

router.use(patientMiddleware);

router.get("/studies", portalController.listStudies);
router.get("/studies/:id/download", portalController.download);

export default router;
