"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";

// The initial HTML can animate immediately. Subsequent mounts in the same
// document use the settled composition, even if the first entrance was interrupted.
let hasOpenedHero = false;

export function MountainHero() {
  const [settled] = useState(() => hasOpenedHero);
  useEffect(() => {
    hasOpenedHero = true;
  }, []);

  return (
    <section
      className="mountain-hero"
      data-entrance={settled ? "settled" : "opening"}
      aria-labelledby="hero-heading"
    >
      <picture className="mountain-camera">
        <source
          media="(max-width: 1100px) and (orientation: portrait)"
          srcSet="/images/alpine-hero-mobile.avif"
          width={660}
          height={901}
        />
        {/* Pre-encoded AVIF variants provide art direction without on-demand transcoding. */}
        <img
          src="/images/alpine-hero.avif"
          srcSet="/images/alpine-hero-1120.avif 1120w, /images/alpine-hero.avif 1536w"
          sizes="(max-width: 1100px) 100vw, 150vw"
          width={1536}
          height={1024}
          fetchPriority="high"
          alt=""
        />
      </picture>
      <div className="mountain-layout">
        <h1 id="hero-heading" className="mountain-title">
          <span>Beyond the</span> <span>ordinary</span>
        </h1>
        <div className="mountain-bottom">
          <div className="mountain-actions">
            <Link href="/trips/new">
              Plan my trip <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
            <Link href="/explore">
              Explore journeys <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <p className="mountain-description">
            Plan extraordinary trips with AI, stay in control of your budget,
            and adapt when plans change.
          </p>
        </div>
      </div>
    </section>
  );
}
