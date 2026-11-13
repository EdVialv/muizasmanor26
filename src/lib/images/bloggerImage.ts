/**
 * Responsive URLs for images hosted by Blogger
 * (docs/DAY15_VISUAL_ALPHA_NOTES.md).
 *
 * Every image in the source workbook's column G ("Attēla oriģinālā saite
 * blogā") is a blogger.googleusercontent.com URL of the form
 *
 *   https://blogger.googleusercontent.com/img/b/<bucket>/<token>/s3754/<file>.jpg
 *
 * The second-to-last path segment is a size directive: `s3754` means "fit
 * within 3754 px on the longer side", and the host serves other sizes when
 * that segment is replaced (`s640`, `s1280`, ...) - the same mechanism
 * Blogger's own post editor uses. That gives a real `srcset` without
 * copying or re-encoding any file.
 *
 * This session could not reach the image host (its sandbox proxy refuses
 * the connection), so the resize behaviour is implemented from the URL
 * format, not observed. ObjectImage therefore falls back to the untouched
 * original URL if a resized one fails to load.
 */

const BLOGGER_HOST = "blogger.googleusercontent.com";
const LEGACY_BLOGGER_HOST_SUFFIX = ".bp.blogspot.com";

/** `s1600`, `w640`, `w640-h480`, `s320-c` and similar. */
const SIZE_SEGMENT = /^[swh]\d{1,5}(?:-[a-z]\d{0,5})*$/;
const LONGEST_SIDE_SEGMENT = /^s(\d{1,5})$/;

function parseBloggerImageUrl(url: string): { parsed: URL; segments: string[] } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") {
    return null;
  }
  const isBloggerHost =
    parsed.hostname === BLOGGER_HOST || parsed.hostname.endsWith(LEGACY_BLOGGER_HOST_SUFFIX);
  if (!isBloggerHost) {
    return null;
  }
  // Work on the raw pathname so the file name's percent-encoding is kept
  // byte-for-byte; nothing is decoded and re-encoded.
  const segments = parsed.pathname.split("/");
  if (segments.length < 3 || !SIZE_SEGMENT.test(segments[segments.length - 2])) {
    return null;
  }
  return { parsed, segments };
}

/** True when the URL has a Blogger size segment that can be rewritten. */
export function isResizableBloggerImageUrl(url: string): boolean {
  return parseBloggerImageUrl(url) !== null;
}

/**
 * Returns the same image constrained to `size` px on its longer side, or
 * null when the URL is not a resizable Blogger image. Never asks for more
 * than the original's own recorded size.
 */
export function resizeBloggerImageUrl(url: string, size: number): string | null {
  const result = parseBloggerImageUrl(url);
  if (!result || !Number.isFinite(size) || size <= 0) {
    return null;
  }
  const { parsed, segments } = result;
  const original = LONGEST_SIDE_SEGMENT.exec(segments[segments.length - 2]);
  const originalSize = original ? Number(original[1]) : null;
  const target = Math.round(originalSize ? Math.min(size, originalSize) : size);

  const resized = [...segments];
  resized[resized.length - 2] = `s${target}`;
  return `${parsed.origin}${resized.join("/")}${parsed.search}`;
}

/** next/image loader: Blogger does the resizing, so Next's optimizer is not involved. */
export function bloggerImageLoader({ src, width }: { src: string; width: number }): string {
  return resizeBloggerImageUrl(src, width) ?? src;
}
