import { createHash } from 'node:crypto';

function normalizeSharePassword(value: string) {
  return value.trim();
}

export function hashSharePagePassword(password: string) {
  return createHash('sha256').update(normalizeSharePassword(password)).digest('hex');
}

export function verifySharePagePassword(password: string, hash: string | null | undefined) {
  if (!hash) {
    return true;
  }

  return hashSharePagePassword(password) === hash;
}

export function hasSharePagePassword(value: string | null | undefined) {
  return Boolean(value && value.trim().length > 0);
}
