import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTelegramQrBufferWithAtomicLogo } from '@/lib/services/telegram-qr';

type MutablePng = {
  width: number;
  height: number;
  data: Uint8Array | Buffer;
};

type PngSyncApi = {
  read: (buffer: Buffer) => MutablePng;
};

const { PNG } = require('pngjs') as { PNG: { sync: PngSyncApi } };

test('generateTelegramQrBufferWithAtomicLogo returns a png with colored logo pixels near the center', async () => {
  const buffer = await generateTelegramQrBufferWithAtomicLogo('ss://example-access-url');
  assert.ok(buffer.length > 0);

  const png = PNG.sync.read(buffer);
  assert.equal(png.width, 320);
  assert.equal(png.height, 320);

  let foundColoredCenterPixel = false;
  const centerX = Math.floor(png.width / 2);
  const centerY = Math.floor(png.height / 2);

  for (let y = centerY - 36; y <= centerY + 36 && !foundColoredCenterPixel; y += 1) {
    for (let x = centerX - 36; x <= centerX + 36; x += 1) {
      const index = (png.width * y + x) << 2;
      const r = png.data[index];
      const g = png.data[index + 1];
      const b = png.data[index + 2];
      if (r !== g || g !== b) {
        foundColoredCenterPixel = true;
        break;
      }
    }
  }

  assert.equal(foundColoredCenterPixel, true);
});
