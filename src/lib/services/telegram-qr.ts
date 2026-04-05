import QRCode from 'qrcode';

type MutablePng = {
  width: number;
  height: number;
  data: Uint8Array | Buffer;
};

type PngSyncApi = {
  read: (buffer: Buffer) => MutablePng;
  write: (png: MutablePng) => Buffer;
};

const { PNG } = require('pngjs') as { PNG: { sync: PngSyncApi } };

const QR_SIZE = 320;
const QR_MARGIN = 3;
const LOGO_RATIO = 0.2;

type RgbaColor = {
  r: number;
  g: number;
  b: number;
  a?: number;
};

const WHITE: RgbaColor = { r: 255, g: 255, b: 255, a: 255 };
const CYAN: RgbaColor = { r: 6, g: 182, b: 212, a: 255 };
const SKY: RgbaColor = { r: 56, g: 189, b: 248, a: 255 };
const VIOLET: RgbaColor = { r: 139, g: 92, b: 246, a: 255 };
const SOFT_CYAN: RgbaColor = { r: 226, g: 252, b: 255, a: 255 };

function blendPixel(png: MutablePng, x: number, y: number, color: RgbaColor) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) {
    return;
  }

  const alpha = (color.a ?? 255) / 255;
  const index = (png.width * y + x) << 2;
  const data = png.data;
  data[index] = Math.round((color.r * alpha) + (data[index] * (1 - alpha)));
  data[index + 1] = Math.round((color.g * alpha) + (data[index + 1] * (1 - alpha)));
  data[index + 2] = Math.round((color.b * alpha) + (data[index + 2] * (1 - alpha)));
  data[index + 3] = 255;
}

function fillCircle(png: MutablePng, cx: number, cy: number, radius: number, color: RgbaColor) {
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(png.width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(png.height - 1, Math.ceil(cy + radius));
  const radiusSq = radius * radius;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if ((dx * dx) + (dy * dy) <= radiusSq) {
        blendPixel(png, x, y, color);
      }
    }
  }
}

function drawEllipseStroke(
  png: MutablePng,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotationRadians: number,
  color: RgbaColor,
  thickness: number,
) {
  const cos = Math.cos(rotationRadians);
  const sin = Math.sin(rotationRadians);
  const samples = 220;

  for (let step = 0; step < samples; step += 1) {
    const theta = (Math.PI * 2 * step) / samples;
    const ellipseX = rx * Math.cos(theta);
    const ellipseY = ry * Math.sin(theta);
    const rotatedX = (ellipseX * cos) - (ellipseY * sin);
    const rotatedY = (ellipseX * sin) + (ellipseY * cos);
    fillCircle(
      png,
      Math.round(cx + rotatedX),
      Math.round(cy + rotatedY),
      thickness,
      color,
    );
  }
}

function paintAtomicLogo(png: MutablePng) {
  const logoSize = Math.floor(png.width * LOGO_RATIO);
  const cx = Math.round(png.width / 2);
  const cy = Math.round(png.height / 2);
  const outerRadius = Math.floor((logoSize / 2) + 10);

  fillCircle(png, cx, cy, outerRadius, WHITE);
  fillCircle(png, cx, cy, outerRadius - 4, { ...SOFT_CYAN, a: 255 });

  drawEllipseStroke(png, cx, cy, logoSize * 0.46, logoSize * 0.16, 0, CYAN, 2);
  drawEllipseStroke(png, cx, cy, logoSize * 0.46, logoSize * 0.16, Math.PI / 3, SKY, 2);
  drawEllipseStroke(png, cx, cy, logoSize * 0.46, logoSize * 0.16, (Math.PI * 2) / 3, VIOLET, 2);

  fillCircle(png, cx, cy, Math.max(6, Math.floor(logoSize * 0.11)), CYAN);
  fillCircle(png, cx, cy, Math.max(3, Math.floor(logoSize * 0.05)), WHITE);
}

export async function generateTelegramQrBufferWithAtomicLogo(value: string) {
  const qrBuffer = await QRCode.toBuffer(value, {
    width: QR_SIZE,
    margin: QR_MARGIN,
    errorCorrectionLevel: 'H',
    color: {
      dark: '#0f172a',
      light: '#ffffffff',
    },
  });

  const png = PNG.sync.read(qrBuffer);
  paintAtomicLogo(png);
  return PNG.sync.write(png);
}
