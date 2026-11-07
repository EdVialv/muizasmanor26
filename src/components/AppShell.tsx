import type { ReactNode } from "react";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

/**
 * Composes the shared header, main-content landmark and footer around a
 * page's own content. Pulled out of the root layout (src/app/layout.tsx)
 * specifically so it can be unit-tested with @testing-library/react: a
 * component returning <html>/<body> cannot be rendered into jsdom's own
 * document the normal way, but this inner shell can.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skipLink" href="#main-content">
        Pāriet uz galveno saturu
      </a>
      <SiteHeader />
      <main id="main-content">{children}</main>
      <SiteFooter />
    </>
  );
}
