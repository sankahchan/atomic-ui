import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isMultipartFormDataContentType,
  parseRestoreUploadFormData,
} from '@/lib/services/restore-upload';

test('isMultipartFormDataContentType accepts multipart uploads', () => {
  assert.equal(
    isMultipartFormDataContentType('multipart/form-data; boundary=----atomic-ui'),
    true,
  );
});

test('isMultipartFormDataContentType rejects non-multipart uploads', () => {
  assert.equal(isMultipartFormDataContentType('application/json'), false);
  assert.equal(isMultipartFormDataContentType(null), false);
});

test('parseRestoreUploadFormData returns 415 for wrong content type', async () => {
  const request = new Request('http://localhost/api/restore', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ backup: 'nope' }),
  });

  const result = await parseRestoreUploadFormData(request);

  assert.equal(result.formData, null);
  assert.deepEqual(result.error, {
    status: 415,
    error: 'Backup restore expects a multipart/form-data upload.',
  });
});

test('parseRestoreUploadFormData returns 400 for malformed multipart uploads', async () => {
  const request = new Request('http://localhost/api/restore', {
    method: 'POST',
    headers: {
      'content-type': 'multipart/form-data; boundary=----atomic-ui',
    },
    body: '{"backup":"broken"}',
  });

  const result = await parseRestoreUploadFormData(request);

  assert.equal(result.formData, null);
  assert.deepEqual(result.error, {
    status: 400,
    error: 'Invalid backup upload. Please choose a backup .zip file and try again.',
  });
});

