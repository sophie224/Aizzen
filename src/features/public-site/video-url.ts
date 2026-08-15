/*
 * Demo-video URL handling for the public site.
 *
 * Only YouTube is recognised. An unrecognised URL is treated as absent rather
 * than passed through to an iframe `src`, which keeps arbitrary administrator
 * input out of a frame the browser will load.
 */

/** Returns a YouTube embed URL, or '' when the value is not a YouTube link. */
export function youTubeEmbedUrl(value: string): string {
  const raw = value.trim()
  if (!raw) return ''

  const match = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i.exec(raw)
  return match ? `https://www.youtube-nocookie.com/embed/${match[1]}?rel=0` : ''
}
