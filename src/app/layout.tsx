import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

import { CookieConsent } from "@/components/cookie-consent";
import { Providers } from "@/components/providers";

// Fonts are self-hosted (see src/app/fonts/README.md): next/font/google fetches
// from fonts.gstatic.com at build time, which intermittently 404s in CI. These
// are the variable (weight-axis) woff2 files, vendored into the repo.
const spaceGrotesk = localFont({
  src: "./fonts/space-grotesk-latin-wght-normal.woff2",
  variable: "--font-space-grotesk",
  weight: "400 700",
  display: "swap",
});

const dmSans = localFont({
  src: "./fonts/dm-sans-latin-wght-normal.woff2",
  variable: "--font-dm-sans",
  weight: "400 600",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Progresso IO — Gestão para personal coaches",
  description:
    "Reúna treinos, dietas, check-ins e mensagens automáticas em um só lugar. Menos tempo no celular, mais resultado para seus alunos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${spaceGrotesk.variable} ${dmSans.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <Providers>{children}</Providers>
        <CookieConsent />
      </body>
    </html>
  );
}
