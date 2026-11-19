import Link from "next/link";
import HeritageObjectCard from "./HeritageObjectCard";
import Icon from "./Icon";
import { fetchDirectoryPage, type DirectoryObjectSummary } from "@/lib/directory/queries";
import { createDirectoryDataSourceFromEnv } from "@/lib/directory/supabaseDataSource";

/** Only published records from the real directory; no demo fallback. */
export default async function HomeFeatured() {
  let items: DirectoryObjectSummary[] = [];
  try {
    const page = await fetchDirectoryPage(createDirectoryDataSourceFromEnv(), null, 3);
    items = page.items;
  } catch {
    // The catalogue route provides the full operational error/retry state.
  }
  return items.length ? (
    <ul className="objectsGrid homeObjectsGrid">
      {items.map((object) => (
        <HeritageObjectCard key={object.id} object={object} />
      ))}
    </ul>
  ) : (
    <div className="homeCatalogueCallout">
      <Icon name="manor" width="48" height="48" />
      <div>
        <h3>Katram objektam savs stāsts</h3>
        <p>Atver katalogu, lai apskatītu publicētos objektus un to informāciju.</p>
      </div>
      <Link className="primaryAction" href="/objects">
        Atvērt katalogu <Icon name="arrow" />
      </Link>
    </div>
  );
}
