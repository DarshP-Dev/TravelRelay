import Link from "next/link";
import { ArrowDown, ArrowUpRight } from "lucide-react";

export function MountainHero() {
  return (
    <section className="mountain-hero" aria-labelledby="hero-heading">
      <div className="mountain-depth" aria-hidden="true">
        <picture className="mountain-camera">
          <source
            media="(max-width: 640px) and (orientation: portrait)"
            srcSet="/images/alpine-hero-mobile.avif"
            width={660}
            height={901}
          />
          {/* Pre-encoded AVIF variants provide art direction without on-demand transcoding. */}
          <img
            src="/images/alpine-hero.avif"
            srcSet="/images/alpine-hero-1120.avif 1120w, /images/alpine-hero.avif 1536w"
            sizes="100vw"
            width={1536}
            height={1024}
            fetchPriority="high"
            alt=""
          />
        </picture>
      </div>
      <div className="container mountain-layout">
        <div className="mountain-copy">
          <p className="mountain-kicker cinematic-reveal">TravelRelay</p>
          <h1 id="hero-heading" className="cinematic-reveal">
            <span>Beyond the</span> <span>ordinary.</span>
          </h1>
          <p className="mountain-description cinematic-reveal">
            Plan extraordinary trips with AI, stay in control of your budget,
            and adapt when plans change.
          </p>
          <div className="mountain-actions cinematic-reveal">
            <Link className="editorial-button" href="/trips/new">
              Plan my trip <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
            <Link
              className="editorial-button editorial-button-outline"
              href="/explore"
            >
              Explore journeys <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </div>
        <a className="mountain-scroll" href="#how-it-works">
          <ArrowDown size={17} aria-hidden="true" /> How it works
        </a>
      </div>
    </section>
  );
}
