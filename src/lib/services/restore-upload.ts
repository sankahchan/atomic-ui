export type RestoreUploadParseError = {
  status: number;
  error: string;
};

const INVALID_CONTENT_TYPE_ERROR: RestoreUploadParseError = {
  status: 415,
  error: 'Backup restore expects a multipart/form-data upload.',
};

const INVALID_FORM_DATA_ERROR: RestoreUploadParseError = {
  status: 400,
  error: 'Invalid backup upload. Please choose a .db, .dump, .sql, or .zip backup file and try again.',
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
