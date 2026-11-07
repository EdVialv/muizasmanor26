import Link from "next/link";

/**
 * The site-wide header: wordmark + primary navigation, shared by every page
 * via the root layout (see src/components/AppShell.tsx).
 *
 * Per the owner's Day 12 decision, the nav deliberately lists only Home for
 * now rather than linking to directory/map/admin/enquiry pages that don't
 * exist yet (Days 13-26) - that would mean either dead links or throwaway
 * stub pages to redo later. Each later Day should add its own <li> to the
 * list below once its page actually ships, not before.
 *
 * `aria-current="page"` is hardcoded on the Home link because Home is the
 * only route that exists today. Once a second nav item is added, switch
 * this to a client component using `usePathname()` from `next/navigation`
 * so the current item is computed per route instead of assumed.
 */
export default function SiteHeader() {
  return (
    <header className="siteHeader">
      <div className="siteHeaderInner container">
        <Link className="wordmark" href="/">
          Latvijas muižas
        </Link>
        <nav className="siteNav" aria-label="Galvenā navigācija">
          <ul>
            <li>
              <Link href="/" aria-current="page">
                Sākums
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
