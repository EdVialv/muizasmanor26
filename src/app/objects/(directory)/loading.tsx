/**
 * Next.js renders this automatically (via the App Router's implicit
 * Suspense boundary for a route segment) while the async ObjectsPage
 * Server Component is still fetching data - no client-side loading state
 * management needed. The skeleton grid is purely decorative (aria-hidden);
 * the one thing assistive tech actually needs announced is the
 * role="status" text.
 */
export default function ObjectsLoading() {
  const placeholderCount = 6;

  return (
    <section className="objectsSection">
      <div className="container">
        <h1 className="objectsHeading">Muižu un kultūrvēsturisko objektu katalogs</h1>
        <p className="directoryStatusNotice" role="status">
          Ielādē sarakstu…
        </p>
        <ul className="objectsGrid" aria-hidden="true">
          {Array.from({ length: placeholderCount }, (_, index) => (
            <li key={index} className="objectCardSkeleton" />
          ))}
        </ul>
      </div>
    </section>
  );
}
