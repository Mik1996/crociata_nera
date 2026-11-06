import bcrypt from 'bcryptjs';

const COST = 12;

/** Hash compared against when the user does not exist, so timing does not reveal accounts. */
let dummyHash: Promise<string> | undefined;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

/**
 * Compares a password with a hash. Pass `null` when the user was not found: a comparison
 * still runs, so response times do not reveal which accounts exist.
 */
export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  if (hash === null) {
    await bcrypt.compare(password, await (dummyHash ??= bcrypt.hash('crociata-nera-dummy', COST)));
    return false;
  }
  return bcrypt.compare(password, hash);
}
