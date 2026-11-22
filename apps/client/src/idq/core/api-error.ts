/**
 * The message of a failed API call, as the server wrote it, or the fallback.
 * Docmost's server answers errors with `{ message }`.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })
    ?.response?.data?.message;
  if (typeof message === "string") return message;
  // Validation errors carry one message per field
  if (Array.isArray(message) && message.every((m) => typeof m === "string")) {
    return message.join("; ");
  }
  return fallback;
}
