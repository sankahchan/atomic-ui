const DEV_JWT_SECRET = 'atomic-ui-dev-secret';

export function getJwtSecretString(): string {
  const configured = process.env.JWT_SECRET?.trim();

  if (configured) {
    if (process.env.NODE_ENV === 'production' && configured.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in production.');
    }
    return configured;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production.');
  }

  return DEV_JWT_SECRET;
}

export function getJwtSecretBytes(): Uint8Array {
  return new TextEncoder().encode(getJwtSecretString());
}
