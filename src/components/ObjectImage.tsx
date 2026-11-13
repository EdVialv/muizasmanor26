"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { bloggerImageLoader, isResizableBloggerImageUrl } from "@/lib/images/bloggerImage";

type Stage = "responsive" | "original" | "failed";

/**
 * One photograph of a heritage object, filling its parent box
 * (docs/DAY15_VISUAL_ALPHA_NOTES.md).
 *
 * The parent must be `position: relative` with a fixed aspect ratio - the
 * `.objectImageFrame` class. That box, not the file, sets the layout size,
 * so the page does not shift when the image arrives or fails.
 *
 * Loading is staged so an image problem degrades instead of breaking:
 *
 *   responsive - a Blogger-resized `srcset`; the browser picks a width that
 *                fits the slot and downloads nothing larger.
 *   original   - the stored URL untouched, used when the URL is not a
 *                resizable Blogger URL, or when a resized request failed.
 *   failed     - a fallback in the same box that says the picture could
 *                not be shown and links to it at its source (the
 *                workbook's column G URL), so the visitor can still open
 *                the original. Inside an element that already links to the
 *                original (a gallery thumbnail), the fallback is plain text
 *                instead - a link may not contain another link.
 *
 * Below-the-fold images are lazy-loaded; pass `eager` only for the one
 * image at the top of a page.
 */
export default function ObjectImage({
  src,
  alt,
  sizes,
  eager = false,
  insideLink = false,
}: {
  src: string;
  /** Empty string for a purely decorative image next to its own text label. */
  alt: string;
  sizes: string;
  eager?: boolean;
  /** True when a parent element already links to `src`. */
  insideLink?: boolean;
}) {
  const [stage, setStage] = useState<Stage>(() =>
    isResizableBloggerImageUrl(src) ? "responsive" : "original",
  );
  const imageRef = useRef<HTMLImageElement | null>(null);

  const handleError = useCallback(() => {
    setStage((current) => (current === "responsive" ? "original" : "failed"));
  }, []);

  // An image can fail before React attaches onError (it was in the server
  // HTML and errored during hydration). A completed image with no pixels is
  // that case.
  useEffect(() => {
    const image = imageRef.current;
    if (image && image.complete && image.naturalWidth === 0) {
      handleError();
    }
  }, [stage, handleError]);

  if (stage === "failed") {
    if (insideLink) {
      return (
        <span className="objectImageFallback">
          <span>
            Attēlu neizdevās parādīt. Atvērt to avotā
            {alt ? <span className="visuallyHidden">: {alt}</span> : null}
          </span>
        </span>
      );
    }
    return (
      <span className="objectImageFallback">
        <span>
          Attēlu neizdevās parādīt.{" "}
          <a
            className="objectImageFallbackLink"
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            // Starts with the visible text, then says which picture and
            // that it opens in a new tab.
            aria-label={`Atvērt attēlu avotā${alt ? `: ${alt}` : ""} (jaunā cilnē)`}
          >
            Atvērt attēlu avotā
          </a>
        </span>
      </span>
    );
  }

  return (
    <Image
      // A new element per stage, so a failed request is not reused.
      key={stage}
      ref={imageRef}
      className="objectImage"
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      loader={stage === "responsive" ? bloggerImageLoader : undefined}
      unoptimized={stage === "original"}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      onError={handleError}
    />
  );
}
