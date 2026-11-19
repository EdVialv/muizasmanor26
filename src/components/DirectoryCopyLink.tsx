"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useDirectoryListing } from "@/components/DirectoryListingProvider";

/** For useSyncExternalStore: "hydrated" never changes once true. */
function subscribeToNothing() {
  return () => {};
}

type CopyStatus = { kind: "idle" } | { kind: "copied"; url: string } | { kind: "manual" };

/**
 * "Kopēt saiti" (Day 20 - docs/DAY20_URL_STATE_NOTES.md): copies the
 * canonical URL of what the visitor is looking at - view, search, filters,
 * list page and map position - from the shared browse state, so it is the
 * newest state even while its navigation is still in flight.
 *
 * Success is announced in a polite live region. When the clipboard is not
 * available (no permission, an insecure context, an old browser), the link
 * is shown in a read-only, pre-selected field to copy by hand. Rendered only
 * with JavaScript: without it the address bar already holds the same
 * canonical link.
 */
export default function DirectoryCopyLink() {
  const pathname = usePathname();
  const { hrefFor } = useDirectoryListing();
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  const [status, setStatus] = useState<CopyStatus>({ kind: "idle" });
  const fieldRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();

  const url = hydrated ? new URL(hrefFor(pathname), window.location.origin).toString() : "";

  useEffect(() => {
    if (status.kind === "manual") {
      fieldRef.current?.focus();
      fieldRef.current?.select();
    }
  }, [status]);

  if (!hydrated) {
    return null;
  }

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(url);
      setStatus({ kind: "copied", url });
    } catch {
      setStatus({ kind: "manual" });
    }
  }

  // "Copied" stays only while the state is still the copied one.
  const message =
    status.kind === "copied" && status.url === url
      ? "Saite nokopēta."
      : status.kind === "manual"
        ? "Saiti neizdevās nokopēt automātiski. Nokopējiet to no lauka zemāk."
        : "";

  return (
    <div className="directoryCopyLink">
      <button type="button" className="directoryCopyLinkButton" onClick={copy}>
        Kopēt saiti
      </button>
      <p className="directoryCopyLinkStatus" role="status" aria-live="polite">
        {message}
      </p>
      {status.kind === "manual" ? (
        <div className="directoryCopyLinkManual">
          <label htmlFor={fieldId}>Saite uz šo skatu</label>
          <input
            ref={fieldRef}
            id={fieldId}
            type="text"
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      ) : null}
    </div>
  );
}
