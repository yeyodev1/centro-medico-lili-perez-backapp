import { Router } from "express";
import { activeUserMiddleware } from "../middlewares/activeUser.middleware";
import { adminMiddleware } from "../middlewares/admin.middleware";
import { authMiddleware } from "../middlewares/auth.middleware";
import { staffMiddleware } from "../middlewares/staff.middleware";
import * as patientController from "../controllers/patient.controller";

const router = Router();

router.use(authMiddleware, activeUserMiddleware, staffMiddleware);

router.get("/", patientController.list);
router.post("/", patientController.create);
router.get("/:id", patientController.getById);
router.put("/:id", patientController.update);
// Borrar arrastra estudios y archivos: solo administración.
router.delete("/:id", adminMiddleware, patientController.remove);
router.get("/:id/studies", patientController.listStudies);

export default router;
