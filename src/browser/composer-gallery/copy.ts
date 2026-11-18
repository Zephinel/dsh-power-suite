/**
 * Copy dictionary for the composer image gallery.
 *
 * The namespace and both dictionaries used to sit inline in `src/client.js`;
 * keys and visible strings are unchanged.
 *
 * @module
 */

/** Copy namespace for the composer image gallery. */
export const PSG_NS = 'composerImageGallery'

export const PSG_EN: Record<string, string> = {
  'dialog': 'Image gallery',
  'close': 'Close image gallery',
  'previous': 'Previous image',
  'next': 'Next image',
  'counter': '{index} / {total}'
}

export const PSG_ZH: Record<string, string> = {
  'dialog': '图片查看器',
  'close': '关闭图片查看器',
  'previous': '上一张',
  'next': '下一张',
  'counter': '{index} / {total}'
}
