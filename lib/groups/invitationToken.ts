import { createHash, randomBytes } from 'node:crypto';

/** SHA-256 hex of the raw token. Matches public.st_hash_invite_token. The raw token is not stored. */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(String(token), 'utf8').digest('hex');
}

export function newInviteToken(): string {
  return randomBytes(32).toString('hex');
}
