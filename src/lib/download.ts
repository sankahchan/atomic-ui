import { normalizePublicSlug } from '@/lib/public-slug';

function triggerDownload(href: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export function buildDownloadFilename(
  name: string | null | undefined,
  suffix: string,
  extension: string,
) {
  const base = normalizePublicSlug(name || '') || 'key';
  const safeSuffix = normalizePublicSlug(suffix) || 'file';
  const safeExtension = extension.replace(/^\.+/, '') || 'txt';
  return `${base}-${safeSuffix}.${safeExtension}`;
}

export function downloadTextFile(
  content: string,
  filename: string,
  type = 'text/plain;charset=utf-8;',
) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  triggerDownload(dataUrl, filename);
}
