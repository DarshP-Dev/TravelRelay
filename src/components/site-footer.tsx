import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-main">
        <div>
          <Link className="footer-brand" href="/">
            TravelRelay<span>.</span>
          </Link>
          <p>
            A little less planning.
            <br />A lot more possibility.
          </p>
        </div>
        <div className="footer-links">
          <Link href="/explore">Explore destinations</Link>
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/trips/new">
            Start planning <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="container footer-bottom">
        <p>
          © {new Date().getFullYear()} TravelRelay · Built for the PayPal AI
          Hackathon
        </p>
        <p>
          Early development · <Link href="/credits">Photography & credits</Link>
        </p>
      </div>
    </footer>
  );
}
