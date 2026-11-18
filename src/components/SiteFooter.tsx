import Link from "next/link";
import Icon from "./Icon";

export default function SiteFooter() {
  return (
    <footer className="siteFooter">
      <div className="siteFooterInner container">
        <div>
          <p className="footerBrand">
            <Icon name="manor" /> MuizasDB
          </p>
          <p className="siteFooterTagline">
            Latvijas muižas — Latvijas kultūrvēsturiskais mantojums vienuviet.
          </p>
        </div>
        <nav aria-label="Kājenes navigācija">
          <Link href="/objects">Muižu katalogs</Link>
          <Link href="/map">Izpētīt kartē</Link>
        </nav>
        <p className="siteFooterMeta">&copy; {new Date().getFullYear()} MuizasDB</p>
      </div>
    </footer>
  );
}
