import type { Response } from "express";

export interface ErrorResponse {
  error: string;
}

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

export function handleRouteError(error: unknown, res: Response<ErrorResponse>, context: string): void {
  console.error(`Error in ${context}:`, error);

  if (error instanceof AppError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
}
