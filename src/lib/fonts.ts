import localFont from 'next/font/local';

/**
 * User-provided Unicode Burmese typeface ("Z01-Umoe001", also known as ဦးမိုးဖောင့်).
 *
 * The font only carries Myanmar glyphs in its Unicode cmap (U+1000-U+109F plus
 * the extended blocks). The unicode-range declaration keeps Latin text on the
 * existing Geist/PlopUI faces while letting Myanmar text fall through to this
 * font automatically.
 */
export const umoeFont = localFont({
  src: '../../public/fonts/umoe-myanmar.woff2',
  variable: '--font-umoe',
  weight: '400',
  style: 'normal',
  display: 'swap',
  preload: true,
  fallback: ['system-ui'],
  declarations: [
    {
      prop: 'unicode-range',
      value: 'U+1000-109F, U+A9E0-A9FF, U+AA60-AA7F, U+25CC',
    },
  ],
});
