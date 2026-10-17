/**
 * Normalises whatever the user typed into the login form into a form that can be
 * matched against `User.phone` or `User.email`.
 *
 * Both are stored with different conventions — phones in E.164 (`+96170000000`)
 * and emails lower-cased — so a single "identifier" input needs to be
 * canonicalised before it can be compared, and compared in more than one way
 * because legacy rows may not follow the current convention exactly.
 */

export type IdentifierKind = 'email' | 'phone';

export interface ResolvedIdentifier {
  kind: IdentifierKind;
  /**
   * Stable key used for brute-force lockout bookkeeping. Prefixed by kind so an
   * email can never collide with a phone number in the shared attempt map.
   */
  key: string;
  /** Values to try against the database, most likely first. */
  candidates: string[];
}

// Deliberately permissive: only used to decide *which column* to query. A value
// that fails this is treated as a phone number, not rejected here, so the real
// error message stays generic and does not leak which format was expected.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function looksLikeEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/**
 * Builds the set of phone strings worth trying for the given input.
 *
 * Accepts the formats real users actually type (`+961 70 000 000`,
 * `0096170000000`, `96170000000`) and returns the equivalents that might be
 * stored, so a mismatch in formatting does not lock a user out of their account.
 */
export function phoneCandidates(raw: string): string[] {
  const stripped = raw.trim().replace(/[\s\-().]/g, '');
  if (!stripped) return [];

  const out: string[] = [];
  const add = (value: string): void => {
    if (value && !out.includes(value)) out.push(value);
  };

  const digits = stripped.replace(/^\+/, '');

  if (/^\d+$/.test(digits)) {
    add(`+${digits}`);
    add(digits);
    // Tolerate rows stored with a leading international access code.
    if (digits.startsWith('00') && digits.length > 2) {
      add(`+${digits.slice(2)}`);
    }
  } else {
    // Not a recognisable phone shape; still try it verbatim so the caller gets
    // the generic "invalid credentials" response rather than a format error.
    add(stripped);
  }

  return out;
}

/**
 * Resolves a raw login field into a queryable identifier.
 * Returns `null` for empty/invalid input so callers can skip the lookup.
 */
export function resolveLoginIdentifier(raw: unknown): ResolvedIdentifier | null {
  if (typeof raw !== 'string') return null;

  const value = raw.trim();
  if (!value) return null;

  if (looksLikeEmail(value)) {
    const email = value.toLowerCase();
    return { kind: 'email', key: `email:${email}`, candidates: [email] };
  }

  const candidates = phoneCandidates(value);
  if (!candidates.length) return null;

  return { kind: 'phone', key: `phone:${candidates[0]}`, candidates };
}

/**
 * Pulls the identifier out of a login request body.
 *
 * Guards run before `ValidationPipe` in Nest, so passport-local reads the raw
 * body. This is what lets a normalised value be injected before the strategy
 * executes, and it keeps the legacy `phone` / `email` field names working.
 */
export function extractLoginIdentifier(body: unknown): ResolvedIdentifier | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;
  return resolveLoginIdentifier(raw.identifier ?? raw.phone ?? raw.email);
}
