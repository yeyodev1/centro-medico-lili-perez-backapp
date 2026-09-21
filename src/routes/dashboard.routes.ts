import { Router } from "express";
import { activeUserMiddleware } from "../middlewares/activeUser.middleware";
import { authMiddleware } from "../middlewares/auth.middleware";
import { staffMiddleware } from "../middlewares/staff.middleware";
import * as dashboardController from "../controllers/dashboard.controller";

const router = Router();

router.use(authMiddleware, activeUserMiddleware, staffMiddleware);

router.get("/stats", dashboardController.stats);

export default router;
