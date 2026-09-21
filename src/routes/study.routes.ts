import { Router } from "express";
import { activeUserMiddleware } from "../middlewares/activeUser.middleware";
import { authMiddleware } from "../middlewares/auth.middleware";
import { staffMiddleware } from "../middlewares/staff.middleware";
import * as studyController from "../controllers/study.controller";

const router = Router();

router.use(authMiddleware, activeUserMiddleware, staffMiddleware);

router.post("/upload-signature", studyController.uploadSignature);
router.post("/", studyController.create);
router.put("/:id", studyController.update);
router.delete("/:id", studyController.remove);
router.get("/:id/download", studyController.download);
router.post("/:id/notify", studyController.notify);

export default router;
