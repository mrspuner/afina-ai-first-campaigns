// Lightweight client-side helpers for the registration survey.
// Kept dependency-free so they can be unit-tested in node environment.

export function isCompanyNameValid(value: string): boolean {
  return value.trim().length >= 2;
}

// The survey's first answer is now a free-text task description, not a URL.
// Accept any non-trivial trimmed string; reject empty / whitespace-only / too-short.
export function isTaskDescriptionValid(value: string): boolean {
  return value.trim().length >= 3;
}
