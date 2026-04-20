import {
  decryptSettingSecret,
  encryptSettingSecret,
  isEncryptedSettingSecret,
  isMaskedSettingSecret,
  maskSettingSecret,
} from '@/lib/settings-crypto';

function parseTelegramBotSettingsObject(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, any>;
  } catch {
    return null;
  }
}

function decryptTelegramSecretField(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    return decryptSettingSecret(trimmed);
  } catch {
    return '';
  }
}

function encryptTelegramSecretField(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return encryptSettingSecret(trimmed);
}

export function parseTelegramBotSettingsValue(value: string | null | undefined): Record<string, any> | null {
  const parsed = parseTelegramBotSettingsObject(value);
  if (!parsed) {
    return null;
  }

  return {
    ...parsed,
    botToken: decryptTelegramSecretField(parsed.botToken),
    webhookSecretToken: decryptTelegramSecretField(parsed.webhookSecretToken),
  };
}

export function serializeTelegramBotSettingsValue(config: Record<string, any>) {
  return JSON.stringify({
    ...config,
    botToken: encryptTelegramSecretField(config.botToken),
    webhookSecretToken: encryptTelegramSecretField(config.webhookSecretToken),
  });
}

export function maskTelegramBotSettingsForClient(config: Record<string, any>) {
  return {
    ...config,
    botToken: maskSettingSecret(typeof config.botToken === 'string' ? config.botToken : ''),
  };
}

export function shouldRetainMaskedTelegramSecret(input: unknown) {
  return typeof input === 'string' && isMaskedSettingSecret(input);
}

export function telegramBotSettingsNeedSecretMigration(value: string | null | undefined) {
  const parsed = parseTelegramBotSettingsObject(value);
  if (!parsed) {
    return false;
  }

  const secrets = [parsed.botToken, parsed.webhookSecretToken];
  return secrets.some(
    (secret) => typeof secret === 'string' && secret.trim().length > 0 && !isEncryptedSettingSecret(secret.trim()),
  );
}
