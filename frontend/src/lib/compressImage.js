/**
 * Shrink a photo in the browser before it is uploaded.
 *
 * A phone camera photo is 3-8 MB; the screen never shows more than ~1600 px of
 * it, so sending the original just makes the person wait. Scaling the long side
 * to `maxSide` and re-encoding as JPEG usually brings it under 300 KB, which
 * uploads in a second or two even on a weak connection.
 *
 * Always safe to call: anything that is not a plain raster image (GIF, SVG,
 * PDF), is already small, cannot be decoded here (e.g. HEIC outside Safari), or
 * would not get smaller, comes back unchanged.
 */
const SKIP_BELOW_BYTES = 250 * 1024
const RASTER = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function compressImage(file, { maxSide = 1600, quality = 0.8 } = {}) {
  try {
    if (!(file instanceof File) || !RASTER.has(file.type) || file.size < SKIP_BELOW_BYTES) return file

    // 'from-image' applies the camera's EXIF rotation, so a portrait photo
    // does not come out sideways once the metadata is dropped.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    // JPEG has no transparency: paint white first so a transparent PNG does not turn black.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file

    const name = file.name.replace(/\.[^.]+$/, '') || 'photo'
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}

/** Compress every image in a FormData in place (in parallel); other fields are untouched. */
export async function compressFormDataImages(formData, options) {
  const entries = [...formData.entries()].filter(([, v]) => v instanceof File)
  await Promise.all(entries.map(async ([key, file]) => {
    const small = await compressImage(file, options)
    if (small !== file) formData.set(key, small, small.name)
  }))
  return formData
}
