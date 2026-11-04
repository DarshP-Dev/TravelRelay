import type { Metadata } from "next";
import localFont from "next/font/local";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

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
    "A thoughtful home for your next adventure. Explore destination inspiration and shape a trip around what matters to you. TravelRelay is in early development.",
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
