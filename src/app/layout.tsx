import type { Metadata } from "next";
import localFont from "next/font/local";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";
import "./editorial.css";

const heading = localFont({
  src: "../../public/fonts/plus-jakarta-sans.woff2",
  variable: "--font-heading",
  weight: "200 800",
  display: "swap",
});
const body = localFont({
  src: "../../public/fonts/inter.woff2",
  variable: "--font-body",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "TravelRelay — A little less planning. A lot more possibility.",
    template: "%s | TravelRelay",
  },
  description:
    "Plan extraordinary trips with AI, stay in control of your budget, and adapt when plans change. Explore curated destinations or plan your own trip.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${heading.variable} ${body.variable}`}
    >
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
