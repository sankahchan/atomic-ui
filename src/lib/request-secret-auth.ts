import { timingSafeEqual } from 'node:crypto';

function hasMatchingSecret(actual: string | null | undefined, expected: string) {
  if (!actual) {
    return false;
  }

  const actualBuffer = Buffer.from(actual.trim());
  const expectedBuffer = Buffer.from(expected.trim());

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function hasValidRequestSecret(
  headers: Headers,
  expectedSecret: string | null | undefined,
  headerName = 'x-cron-secret',
) {
  const expected = expectedSecret?.trim();
  if (!expected) {
    return false;
  }

  const directHeader = headers.get(headerName);
  if (hasMatchingSecret(directHeader, expected)) {
    return true;
  }

  const authorization = headers.get('authorization');
  if (!authorization) {
    return false;
  }

  const bearerPrefix = 'bearer ';
  if (!authorization.toLowerCase().startsWith(bearerPrefix)) {
    return false;
  }

  return hasMatchingSecret(authorization.slice(bearerPrefix.length), expected);
}
