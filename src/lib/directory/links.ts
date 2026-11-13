/**
 * Links between the directory and object pages that carry the visitor's
 * place in the directory along with them (docs/DAY14_OBJECT_PAGES_NOTES.md).
 *
 * The directory's own state is a single bounded `cursor` token
 * (src/lib/directory/cursor.ts). An object link opened from page N of the
 * directory carries that same token as `from`, so the object page can offer
 * "back to the directory" at page N instead of page 1 - and links onward to
 * a related object keep passing it along. It is one token, not a history:
 * the Day 13 review removed an accumulating URL history parameter, and this
 * does not reintroduce one.
 *
 * `from` is untrusted URL input like any other. It is only ever used after
 * decodeCursor() accepts it; anything else is dropped and the back link
 * points at the first page.
 */

import { decodeCursor } from "./cursor";

export interface DirectoryContext {
  /** A cursor token that has already passed decodeCursor(). */
  cursor?: string;
}

export const DIRECTORY_PATH = "/objects";

/** Keeps `from` only when it is a well-formed cursor token. */
export function parseDirectoryContext(from: string | string[] | undefined): DirectoryContext {
  if (typeof from !== "string") {
    return {};
  }
  return decodeCursor(from) ? { cursor: from } : {};
}

export function buildDirectoryHref(context: DirectoryContext = {}): string {
  if (!context.cursor) {
    return DIRECTORY_PATH;
  }
  return `${DIRECTORY_PATH}?${new URLSearchParams({ cursor: context.cursor }).toString()}`;
}

export function buildObjectHref(slug: string, context: DirectoryContext = {}): string {
  const path = `${DIRECTORY_PATH}/${encodeURIComponent(slug)}`;
  if (!context.cursor) {
    return path;
  }
  return `${path}?${new URLSearchParams({ from: context.cursor }).toString()}`;
}
