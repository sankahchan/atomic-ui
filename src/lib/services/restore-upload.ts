export type RestoreUploadParseError = {
  status: number;
  error: string;
};

const DEFAULT_MAX_BACKUP_UPLOAD_BYTES = 256 * 1024 * 1024;

function getMaxBackupUploadBytes() {
  const configured = Number.parseInt(process.env.MAX_BACKUP_UPLOAD_BYTES || '', 10);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_BACKUP_UPLOAD_BYTES;
}

const INVALID_CONTENT_TYPE_ERROR: RestoreUploadParseError = {
  status: 415,
  error: 'Backup restore expects a multipart/form-data upload.',
};

const INVALID_FORM_DATA_ERROR: RestoreUploadParseError = {
  status: 400,
  error: 'Invalid backup upload. Please choose a .db, .dump, .sql, .postgres.zip, or .zip backup file and try again.',
};

const BACKUP_UPLOAD_TOO_LARGE_ERROR: RestoreUploadParseError = {
  status: 413,
  error: 'Backup upload is too large. Please choose a smaller backup file and try again.',
};

export function isMultipartFormDataContentType(contentType: string | null | undefined) {
  if (!contentType) {
    return false;
  }

  return contentType.toLowerCase().startsWith('multipart/form-data');
}

export async function parseRestoreUploadFormData(
  request: Request,
): Promise<{ formData: FormData | null; error: RestoreUploadParseError | null }> {
  if (!isMultipartFormDataContentType(request.headers.get('content-type'))) {
    return {
      formData: null,
      error: INVALID_CONTENT_TYPE_ERROR,
    };
  }

  const contentLength = Number.parseInt(request.headers.get('content-length') || '', 10);
  if (Number.isFinite(contentLength) && contentLength > getMaxBackupUploadBytes()) {
    return {
      formData: null,
      error: BACKUP_UPLOAD_TOO_LARGE_ERROR,
    };
  }

  try {
    return {
      formData: await request.formData(),
      error: null,
    };
  } catch {
    return {
      formData: null,
      error: INVALID_FORM_DATA_ERROR,
    };
  }
}

export function isBackupUploadWithinLimit(sizeBytes: number) {
  return sizeBytes > 0 && sizeBytes <= getMaxBackupUploadBytes();
}

export { BACKUP_UPLOAD_TOO_LARGE_ERROR };
