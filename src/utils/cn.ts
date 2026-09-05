/** Joins class names, dropping falsy values. Intentionally dependency-free. */
export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}
