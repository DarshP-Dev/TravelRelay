import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Compass,
  MapPin,
  Route,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { ButtonLink, Eyebrow, SectionLink } from "@/components/ui";
import { DestinationImage } from "@/components/destination-image";
import { TripCard } from "@/components/trip-card";
import { curatedTrips } from "@/lib/curated-trips";

export default function HomePage() {
  return (
    <>
      <section className="container hero" aria-labelledby="hero-heading">
        <div className="hero-copy">
          <div className="hero-kicker">
            <span />
            LESS LOGISTICS. MORE LIVING.
          </div>
          <h1 id="hero-heading">
            The world is yours
            <br className="desktop-break" /> to <em>explore.</em>
            <br />
            We’ll handle
            <br className="desktop-break" /> the planning.
          </h1>
          <p className="hero-description">
            For the places you’ve been dreaming of, and the ones you haven’t
            found yet. A more thoughtful way to plan what’s next.
          </p>
          <div className="hero-actions">
            <ButtonLink href="/trips/new">
              Start Planning <ArrowUpRight size={18} aria-hidden="true" />
            </ButtonLink>
            <ButtonLink href="#how-it-works" variant="text">
              See How It Works <ArrowDown size={16} aria-hidden="true" />
            </ButtonLink>
          </div>
          <div className="hero-note">
            <Compass size={16} aria-hidden="true" />
            <span>Your kind of trip. Your pace. Your possibilities.</span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-photo">
            <DestinationImage
              src="/images/cinque-terre.jpg"
              alt="Sunlit colorful Cinque Terre houses perched above the turquoise Ligurian Sea"
              priority
              sizes="(max-width: 900px) 100vw, 55vw"
            />
            <div className="hero-photo-shade" />
            <div className="photo-location">
              <MapPin size={15} aria-hidden="true" />
              <span>
                Somewhere you’d rather be.<strong>Cinque Terre, Italy</strong>
              </span>
            </div>
            <span className="photo-index">01 / A WORLD OF POSSIBILITIES</span>
          </div>
          <div className="itinerary-peek">
            <div className="peek-heading">
              <span className="peek-icon">
                <Route size={19} aria-hidden="true" />
              </span>
              <div>
                <span className="micro-label">A LITTLE INSPIRATION</span>
                <h2>A slower day by the sea</h2>
              </div>
              <span className="peek-tag">Editorial idea</span>
            </div>
            <div className="peek-item">
              <span className="peek-time">09:00</span>
              <span className="peek-dot" />
              <div>
                <strong>Espresso. Sea air. No rush.</strong>
                <span>A morning in Monterosso</span>
              </div>
              <span className="peek-emoji" aria-hidden="true">
                ☕
              </span>
            </div>
            <div className="peek-item">
              <span className="peek-time">11:00</span>
              <span className="peek-dot gold" />
              <div>
                <strong>Follow the coastal path</strong>
                <span>Leave a little room for discovery</span>
              </div>
              <span className="peek-emoji" aria-hidden="true">
                ☀
              </span>
            </div>
            <p className="peek-disclaimer">
              Illustrative preview · Not a generated or bookable itinerary
            </p>
          </div>
        </div>
      </section>
      <div className="container principles-strip">
        <span>GOOD TRIPS START WITH A LITTLE SPACE TO DREAM.</span>
        <div>
          <span>
            <Compass size={17} aria-hidden="true" />
            Made around you
          </span>
          <span>
            <Wallet size={17} aria-hidden="true" />
            Mindful of your budget
          </span>
          <span>
            <Route size={17} aria-hidden="true" />
            Room for the unexpected
          </span>
        </div>
      </div>
      <section id="how-it-works" className="container section how-section">
        <div className="section-heading">
          <div>
            <Eyebrow>THE JOURNEY, SIMPLIFIED</Eyebrow>
            <h2>
              From “what if” to{" "}
              <span className="serif-accent">“let’s go.”</span>
            </h2>
          </div>
          <p>
            Less time juggling tabs.
            <br />
            More time looking forward to it.
          </p>
        </div>
        <div className="process-grid">
          {[
            {
              number: "01",
              icon: Compass,
              title: "Start with a feeling",
              text: "A city on your list, a craving for adventure, or simply a need to slow down. Start wherever you are.",
            },
            {
              number: "02",
              icon: Route,
              title: "Make it your kind of trip",
              text: "Bring your dates, budget, and little preferences together in one thoughtful planning space.",
            },
            {
              number: "03",
              icon: Sparkles,
              title: "Leave room for possibility",
              text: "Our vision: an adaptable plan, with an AI companion to help when your plans change.",
            },
          ].map((item) => (
            <article className="process-card" key={item.number}>
              <div className="process-top">
                <item.icon size={25} strokeWidth={1.5} aria-hidden="true" />
                <span>{item.number}</span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
        <p className="development-note">
          We’re building this journey step by step. Trip saving, AI planning,
          and payments are not connected yet.
        </p>
      </section>
      <section className="showcase-section">
        <div className="container showcase-grid">
          <div className="workspace-illustration">
            <div className="mini-workspace-top">
              <span className="mini-logo">
                <ArrowUpRight size={15} aria-hidden="true" />
                TravelRelay
              </span>
              <span className="preview-label">WORKSPACE PREVIEW</span>
            </div>
            <div className="mini-photo">
              <DestinationImage
                src="/images/kyoto.jpg"
                alt="A traditional Kyoto lane at dusk"
              />
              <div>
                <span>YOUR NEXT CHAPTER</span>
                <h3>A little time in Kyoto.</h3>
              </div>
            </div>
            <div className="mini-tabs">
              <span className="selected">Overview</span>
              <span>Itinerary</span>
              <span>TripWallet</span>
              <span>Bookings</span>
            </div>
            <div className="mini-empty">
              <CalendarDays size={22} aria-hidden="true" />
              <div>
                <strong>Room for your whole adventure.</strong>
                <span>Your days, details, and decisions — together.</span>
              </div>
            </div>
          </div>
          <div className="showcase-copy">
            <Eyebrow>ONE TRIP. EVERYTHING IN REACH.</Eyebrow>
            <h2>
              A home for
              <br />
              the whole adventure.
            </h2>
            <p>
              Your itinerary, trip budget, and booking details deserve a little
              breathing room. We’re bringing them together in one calm,
              considered workspace.
            </p>
            <ul className="check-list">
              <li>
                <Check size={17} aria-hidden="true" />A clear view of every day
              </li>
              <li>
                <Check size={17} aria-hidden="true" />A budget that stays part
                of the conversation
              </li>
              <li>
                <Check size={17} aria-hidden="true" />
                An assistant alongside your plans
              </li>
            </ul>
            <SectionLink href="/trips/preview">
              Take a look at the workspace
            </SectionLink>
          </div>
        </div>
      </section>
      <section className="container section inspiration-section">
        <div className="section-heading">
          <div>
            <Eyebrow>A LITTLE INSPIRATION</Eyebrow>
            <h2>
              Where could <span className="serif-accent">next</span> take you?
            </h2>
          </div>
          <SectionLink href="/explore">Explore all destinations</SectionLink>
        </div>
        <div className="trip-grid">
          {curatedTrips.slice(0, 3).map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
        <p className="section-caption">
          Hand-curated editorial starting points · Illustrative budgets, not
          live quotes or AI-generated trips.
        </p>
      </section>
      <section className="container companion-section">
        <div className="companion-copy">
          <Eyebrow>A THOUGHTFUL TRAVEL COMPANION</Eyebrow>
          <h2>
            A change of plans.
            <br />
            Still a world of possibility.
          </h2>
          <p>
            The TravelRelay vision pairs context-aware AI with PayPal Sandbox
            checkout for supported demo experiences. You’ll review changes and
            approve financial actions separately.
          </p>
          <div className="planned-badge">
            <span />
            Planned for a later milestone
          </div>
        </div>
        <div className="companion-principles">
          <div>
            <span className="feature-icon">
              <Sparkles size={22} aria-hidden="true" />
            </span>
            <h3>Suggestions with context</h3>
            <p>
              Built around your time, interests, and budget. You stay in control
              of every change.
            </p>
          </div>
          <div>
            <span className="feature-icon">
              <ShieldCheck size={22} aria-hidden="true" />
            </span>
            <h3>Clear choices. Explicit approval.</h3>
            <p>
              No automatic charges. Future checkout and refunds will use
              verified PayPal Sandbox transactions.
            </p>
          </div>
        </div>
      </section>
      <section className="container final-cta">
        <div>
          <Eyebrow>YOUR NEXT CHAPTER STARTS HERE</Eyebrow>
          <h2>Go on. Get a little carried away.</h2>
          <p>The best part of a trip should be the trip.</p>
        </div>
        <ButtonLink href="/trips/new">
          Start Planning <ArrowRight size={18} aria-hidden="true" />
        </ButtonLink>
      </section>
    </>
  );
}
