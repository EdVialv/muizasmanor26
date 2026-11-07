/**
 * The site-wide footer, shared by every page via the root layout. Kept
 * deliberately minimal for Day 12 (name, tagline, year) - contact details,
 * source/legal links and a sitemap belong to later Days once there are
 * real pages for them to point to.
 */
export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="siteFooter">
      <div className="siteFooterInner container">
        <p className="siteFooterTagline">
          Latvijas muižas — Latvijas kultūrvēsturiskais mantojums vienuviet.
        </p>
        <p className="siteFooterMeta">&copy; {year} Latvijas muižas</p>
      </div>
    </footer>
  );
}
