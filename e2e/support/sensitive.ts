/**
 * Finds secrets in an API response body. Three independent checks, so a leak is caught whatever its
 * shape:
 * - field NAMES, at any depth, case-insensitively: anything named like a hash, a secret, a salt, a
 *   password or a refresh token (`passwordHash`, `tokenHash`, `TokenHash`, `resetPasswordTokenHash`,
 *   `verifyEmailTokenHash`, `refreshToken`, `jwtSecret`…);
 * - VALUES that look like a bcrypt hash (`$2a$`/`$2b$`/`$2y$`);
 * - the actual secret values given by the caller (e.g. the hashes stored in the database for this
 *   user), wherever they appear, even inside a longer string.
 * Returns the JSON paths found (empty when the body is clean).
 */
export function findSensitive(body: unknown, knownSecrets: readonly string[] = []): string[] {
  const found: string[] = [];
  const secrets = knownSecrets.filter((s) => s.length >= 16);
  const visit = (value: unknown, path: string) => {
    if (Array.isArray(value)) return value.forEach((item, i) => visit(item, `${path}[${i}]`));
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        const childPath = `${path}.${key}`;
        if (SENSITIVE_KEY.test(key)) found.push(`${childPath} (field name)`);
        visit(child, childPath);
      }
      return;
    }
    if (typeof value === 'string') {
      if (BCRYPT.test(value)) found.push(`${path} (bcrypt hash)`);
      if (secrets.some((secret) => value.includes(secret))) found.push(`${path} (stored secret)`);
    }
  };
  visit(body, '$');
  return found;
}

/** Field names that must never reach a client. */
const SENSITIVE_KEY = /hash|secret|salt|^password$|^passwd$|refresh_?token/i;
const BCRYPT = /\$2[aby]\$\d{2}\$/;
