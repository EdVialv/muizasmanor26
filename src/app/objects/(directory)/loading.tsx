/**
 * Next.js renders this automatically (via the App Router's implicit
 * Suspense boundary for a route segment) while the async ObjectsPage
 * Server Component is still fetching data. Since Day 16 the heading and the
 * search field are in ./layout.tsx, above this boundary, so only the
 * results area is replaced while loading. The skeleton grid is purely
 * decorative (aria-hidden); the one thing assistive tech needs announced is
 * the role="status" text.
 */
export default function ObjectsLoading() {
  const placeholderCount = 6;

  return (
    <>
      <p className="directoryStatusNotice" role="status">
        Ielādē sarakstu…
      </p>
      <ul className="objectsGrid" aria-hidden="true">
        {Array.from({ length: placeholderCount }, (_, index) => (
          <li key={index} className="objectCardSkeleton" />
        ))}
      </ul>
    </>
  );
}
