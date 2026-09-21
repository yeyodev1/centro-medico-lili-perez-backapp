import { Router } from "express";
import { activeUserMiddleware } from "../middlewares/activeUser.middleware";
import { adminMiddleware } from "../middlewares/admin.middleware";
import { authMiddleware } from "../middlewares/auth.middleware";
import * as userController from "../controllers/user.controller";

const router = Router();

router.use(authMiddleware, activeUserMiddleware, adminMiddleware);

router.get("/", userController.list);
router.post("/", userController.create);
router.put("/:id", userController.update);

export default router;
