import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import HomeFeatured from "@/components/HomeFeatured";
import Icon from "@/components/Icon";
import { MAX_SEARCH_QUERY_LENGTH } from "@/lib/directory/searchQuery";

// Published objects must be read at request time, not frozen into the build.
export const dynamic = "force-dynamic";

const collections = [
  { label: "Visi objekti", href: "/objects" },
  { label: "Muižas", href: "/objects?type=manor_estate&type=manor_house" },
  { label: "Pilis", href: "/objects?type=palace_or_castle" },
  { label: "Parki un dārzi", href: "/objects?type=park_or_garden" },
  { label: "Brīvi apmeklējamas", href: "/objects?access=open" },
];

export default function Home() {
  return (
    <>
      <section className="travelHero" aria-labelledby="page-title">
        <Image
          className="travelHeroImage"
          src="/images/rundale-hero.webp"
          alt="Rundāles pils fasāde un franču dārzs"
          fill
          sizes="100vw"
          preload
        />
        <div className="travelHeroShade" />
        <div className="container travelHeroContent">
          <p className="eyebrow">Vietas, kurās satikt Latvijas vēsturi</p>
          <h1 id="page-title">
            Atklāj Latvijas <br />
            muižas
          </h1>
          <p className="travelHeroIntro">
            Iedvesma ceļojumam.
            <br />
            Vieta vēstures izzināšanai.
          </p>
          <form
            id="home-search-form"
            className="homeSearch"
            role="search"
            action="/objects"
            method="get"
          >
            <label className="visuallyHidden" htmlFor="home-search">
              Meklēt muižu vai vietu
            </label>
            <Icon name="search" />
            <input
              id="home-search"
              type="search"
              name="q"
              placeholder="Meklēt muižu vai vietu"
              maxLength={MAX_SEARCH_QUERY_LENGTH}
              enterKeyHint="search"
            />
            <button className="primaryAction" type="submit">
              Meklēt <Icon name="arrow" />
            </button>
          </form>
          <button className="heroMapLink" type="submit" form="home-search-form" formAction="/map">
            <Icon name="map" /> Izpētīt kartē <Icon name="arrow" width="18" height="18" />
          </button>
        </div>
        <p className="heroCredit">
          Rundāles pils · Foto:{" "}
          <a href="https://commons.wikimedia.org/wiki/File:Rundale_Palace.JPG">Tiago Fioreze</a> ·{" "}
          <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a> · samazināts,
          kadrēts
        </p>
      </section>

      <nav className="collectionNav container" aria-label="Iepazīsti katalogu">
        <span className="collectionNavLabel">Sāc ar sev tuvāko</span>
        <ul>
          {collections.map((item) => (
            <li key={item.label}>
              <Link href={item.href}>{item.label}</Link>
            </li>
          ))}
        </ul>
      </nav>

      <section className="homeDiscovery container" aria-labelledby="discover-title">
        <div className="sectionHeading">
          <div>
            <p className="eyebrow">Iepazīsti mantojumu</p>
            <h2 id="discover-title">Izvēlies nākamo pieturu</h2>
          </div>
          <Link className="textLink" href="/objects">
            Visi objekti <Icon name="arrow" />
          </Link>
        </div>
        <Suspense
          fallback={
            <div className="homeFeaturedLoading" role="status">
              Ielādē muižas…
            </div>
          }
        >
          <HomeFeatured />
        </Suspense>
      </section>

      <section className="homeMapInvite container" aria-labelledby="map-invite-title">
        <div className="mapInviteIcon">
          <Icon name="map" width="72" height="72" />
        </div>
        <div>
          <p className="eyebrow">Skats uz apkārtni</p>
          <h2 id="map-invite-title">Atrodi muižas savā ceļā</h2>
          <p>
            Izpēti karti. Atlasi pēc atrašanās vietas, apmeklējuma iespējām vai vēsturiskās dzimtas.
          </p>
        </div>
        <Link className="primaryAction" href="/map">
          Atvērt karti <Icon name="arrow" />
        </Link>
      </section>
    </>
  );
}
