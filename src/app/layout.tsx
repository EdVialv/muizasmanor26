import type { Metadata } from "next";
import type { ReactNode } from "react";
import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Latvijas muižas",
    template: "%s | Latvijas muižas",
  },
  description: "Atklāj Latvijas muižas, to stāstus, pakalpojumus un pasākumu iespējas.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="lv">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
