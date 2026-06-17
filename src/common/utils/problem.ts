import { STATUS_CODES } from "node:http";
import type { Hook } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import type { Context, Env } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const PROBLEM_JSON = "application/problem+json";
const PROBLEM_HEADERS = { "Content-Type": PROBLEM_JSON };

export const ProblemDetailsSchema = z
  .object({
    type: z.string().meta({
      description: 'URI reference identifying the problem type (currently "about:blank")',
      example: "about:blank",
    }),
    title: z.string().meta({ description: "Short, human-readable summary", example: "Unauthorized" }),
    status: z.number().int().meta({ description: "HTTP status code", example: 401 }),
    detail: z.string().optional().meta({ description: "Human-readable explanation", example: "Unauthorized" }),
    instance: z.string().optional().meta({ description: "URI reference identifying the specific occurrence" }),
    errors: z
      .array(
        z.object({
          path: z.string().meta({ example: "email" }),
          message: z.string().meta({ example: "Invalid email" }),
        }),
      )
      .optional()
      .meta({ description: "Field-level validation errors" }),
  })
  .meta({ id: "ProblemDetails" });

export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

export function buildProblem(
  c: Context,
  status: number,
  detail?: string,
  errors?: ProblemDetails["errors"],
): ProblemDetails {
  return {
    type: "about:blank",
    title: STATUS_CODES[status] ?? "Error",
    status,
    ...(detail ? { detail } : {}),
    instance: c.req.path,
    ...(errors ? { errors } : {}),
  };
}

export function problemResponse(c: Context, status: ContentfulStatusCode, detail?: string): Response {
  return c.json(buildProblem(c, status, detail), status, PROBLEM_HEADERS);
}

/** Reusable error response definition for createRoute responses. */
export const jsonError = (description: string) => ({
  content: { [PROBLEM_JSON]: { schema: ProblemDetailsSchema } },
  description,
});

/** defaultHook: turn Zod validation failures into a 400 Problem Details response. */
export function defaultHook<E extends Env>(): Hook<unknown, E, string, unknown> {
  return (result, c) => {
    if (result.success) return undefined;
    const errors = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    const detail = errors[0]?.message ?? "Validation failed";
    return c.json(buildProblem(c, 400, detail, errors), 400, PROBLEM_HEADERS);
  };
}
