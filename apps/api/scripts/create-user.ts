/**
 * Creates the SQL to add a user (used to bootstrap the first ADMIN, AUTH-6).
 *
 *   $env:FFA_EMAIL="you@example.com"; $env:FFA_NAME="Your Name"; $env:FFA_ROLE="ADMIN"
 *   $env:FFA_PASSWORD="a long passphrase"; pnpm --filter @ffa/api create-user
 *
 * The password is read from the environment so it never lands in shell history or process lists
 * as a command-line argument. Only the scrypt hash is written, to .tmp/create-user.sql (git-ignored).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { checkPassword, hashPassword, normalizeEmail, PASSWORD_MESSAGES } from "@ffa/auth";
import { newId } from "@ffa/validators";

const email = normalizeEmail(process.env.FFA_EMAIL ?? "");
const name = (process.env.FFA_NAME ?? "").trim();
const role = process.env.FFA_ROLE ?? "";
const password = process.env.FFA_PASSWORD ?? "";

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("FFA_EMAIL is missing or not an email address");
if (!name) throw new Error("FFA_NAME is required");
if (role !== "ADMIN" && role !== "STAFF") throw new Error("FFA_ROLE must be ADMIN or STAFF");
const problems = checkPassword(password, { email });
if (problems.length) throw new Error(problems.map((p) => PASSWORD_MESSAGES[p]).join(" "));

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const now = Date.now();
const sql =
  `INSERT INTO user (id, email, name, role, active, password_hash, session_version, failed_logins, created_at, updated_at) ` +
  `VALUES (${q(newId())}, ${q(email)}, ${q(name)}, ${q(role)}, 1, ${q(await hashPassword(password))}, 0, 0, ${now}, ${now});\n`;

mkdirSync(".tmp", { recursive: true });
writeFileSync(".tmp/create-user.sql", sql);
console.log("Wrote .tmp/create-user.sql. Apply it with one of:");
console.log("  wrangler d1 execute DB --local --file .tmp/create-user.sql");
console.log("  wrangler d1 execute DB --env staging --remote --file .tmp/create-user.sql");
