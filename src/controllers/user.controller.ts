import { Response, NextFunction } from "express";
import { CustomError } from "../errors/customError.error";
import { AuthRequest } from "../types/AuthRequest";
import * as userService from "../services/user.service";

/** GET /api/users */
export async function list(_req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await userService.listUsers());
  } catch (error) {
    next(error);
  }
}

/** POST /api/users — body: { name, email, password, phone?, accountType } */
export async function create(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await userService.createUser(req.body));
  } catch (error) {
    next(error);
  }
}

/** PUT /api/users/:id — body: { name?, phone?, accountType?, isActive?, password? } */
export async function update(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new CustomError("No autorizado", 401);
    res.status(200).json(await userService.updateUser(req.params.id, req.body, req.user.userId));
  } catch (error) {
    next(error);
  }
}
