import type { Context } from "hono";
import { problemResponse } from "./problem.js";

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid request") {
    super(message, 400);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, 409);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403);
  }
}

/**
 * Map an AppError to an RFC 9457 Problem Details response. For use in Hono's
 * `app.onError`. Non-AppError values fall through (caller emits a 500).
 */
export function appErrorToProblem(error: AppError, c: Context): Response {
  return problemResponse(c, error.statusCode as Parameters<typeof problemResponse>[1], error.message);
}
