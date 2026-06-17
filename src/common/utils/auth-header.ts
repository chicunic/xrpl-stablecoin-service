/** Extract the token from a `Bearer <token>` Authorization header, or undefined if absent/malformed. */
export function extractBearerToken(authHeader: string | undefined): string | undefined {
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
}
