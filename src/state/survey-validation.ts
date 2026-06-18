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

// Loose URL check tuned for the prototype: accepts forms like
//   example.com
//   www.example.ru
//   https://acme.io/path
// Rejects strings without a dot or with whitespace inside.
export function isWebsiteValid(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/\s/.test(v)) return false;
  // Must contain at least one dot with non-empty parts on both sides.
  const stripped = v.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const host = stripped.split("/")[0];
  if (!host) return false;
  const parts = host.split(".");
  if (parts.length < 2) return false;
  return parts.every((p) => p.length > 0) && /[a-z]/i.test(parts[parts.length - 1]);
}

// Adds https:// when the user typed bare "example.com". Trims trailing slashes.
export function normalizeWebsite(value: string): string {
  const v = value.trim();
  if (!v) return "";
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  return withScheme.replace(/\/+$/, "");
}
