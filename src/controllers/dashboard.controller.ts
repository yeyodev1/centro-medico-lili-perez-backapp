import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/AuthRequest";
import * as dashboardService from "../services/dashboard.service";

/** GET /api/dashboard/stats */
export async function stats(_req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await dashboardService.getStats());
  } catch (error) {
    next(error);
  }
}
