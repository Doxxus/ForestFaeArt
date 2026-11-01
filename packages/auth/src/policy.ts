export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

// Small built-in blocklist. A larger list can be loaded later without changing the interface.
const COMMON = new Set([
  "password",
  "password1",
  "password123",
  "123456789012",
  "qwertyuiopas",
  "letmein12345",
  "welcome12345",
  "iloveyou1234",
  "forestfae",
  "forestfaefolkart",
  "forestfaeart",
]);

export type PasswordProblem = "TOO_SHORT" | "TOO_LONG" | "TOO_COMMON" | "CONTAINS_EMAIL" | "REPETITIVE";

export function checkPassword(password: string, context: { email?: string } = {}): PasswordProblem[] {
  const problems: PasswordProblem[] = [];
  const lower = password.normalize("NFKC").toLowerCase();
  if (password.length < MIN_PASSWORD_LENGTH) problems.push("TOO_SHORT");
  if (password.length > MAX_PASSWORD_LENGTH) problems.push("TOO_LONG");
  if (COMMON.has(lower)) problems.push("TOO_COMMON");
  const local = context.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) problems.push("CONTAINS_EMAIL");
  if (password.length > 0 && new Set(lower).size <= 3) problems.push("REPETITIVE");
  return problems;
}

export const PASSWORD_MESSAGES: Record<PasswordProblem, string> = {
  TOO_SHORT: `Use at least ${MIN_PASSWORD_LENGTH} characters. A few random words works well.`,
  TOO_LONG: `Use at most ${MAX_PASSWORD_LENGTH} characters.`,
  TOO_COMMON: "That password is too easy to guess.",
  CONTAINS_EMAIL: "Please don't include your email name in the password.",
  REPETITIVE: "Please use a more varied password.",
};
