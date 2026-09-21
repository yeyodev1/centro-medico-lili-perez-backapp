import { Router } from "express";
import { activeUserMiddleware } from "../middlewares/activeUser.middleware";
import { authMiddleware } from "../middlewares/auth.middleware";
import * as authController from "../controllers/auth.controller";

const router = Router();

router.post("/login", authController.login);

// Un token vigente no basta: la cuenta tiene que seguir activa.
router.use(authMiddleware, activeUserMiddleware);

router.get("/me", authController.me);
router.put("/password", authController.changePassword);

export default router;
