import { ArrowUpRight, Compass, Route, Wallet } from "lucide-react";
import { DestinationImage } from "@/components/destination-image";
import { DestinationShowcase } from "@/components/destination-showcase";
import { MountainHero } from "@/components/mountain-hero";
import { ButtonLink, Eyebrow, SectionLink } from "@/components/ui";
import { curatedTrips } from "@/lib/curated-trips";

const featuredTrips = curatedTrips.filter(({ id }) =>
  ["cinque-terre", "kyoto", "paris"].includes(id),
);

const planningSteps = [
  {
    icon: Compass,
    title: "Find your starting point",
    text: "Pick a place you have been dreaming about, or ask TravelRelay for a destination that fits your interests.",
  },
  {
    icon: Route,
    title: "Make it your kind of trip",
    text: "Share your dates, pace and group budget. Get a personalized AI itinerary you can edit as your plans take shape.",
  },
  {
    icon: Wallet,
    title: "Stay ready for a change",
    text: "Track estimates and keep a reserve in TripWallet. If a supported booking is disrupted, review recovery options before making changes.",
  },
];

export default function HomePage() {
  return (
    <div className="editorial-home">
      <MountainHero />
      <section
        className="container editorial-section"
        aria-labelledby="inspiration-title"
      >
        <div className="editorial-section-heading">
          <div>
            <Eyebrow>Curated journeys</Eyebrow>
            <h2 id="inspiration-title">
              Where could <em>next</em> take you?
            </h2>
          </div>
          <SectionLink href="/explore">All destinations</SectionLink>
        </div>
        <DestinationShowcase
          id="home-journeys"
          trips={featuredTrips}
          heading="h3"
        />
      </section>
      <section
        id="how-it-works"
        className="container editorial-section editorial-process"
      >
        <div className="editorial-section-heading">
          <div>
            <Eyebrow>How it works</Eyebrow>
            <h2>
              From “what if” to <em>“let’s go.”</em>
            </h2>
          </div>
        </div>
        <ol className="editorial-process-steps">
          {planningSteps.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <Icon size={25} strokeWidth={1.5} aria-hidden="true" />
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="editorial-workspace">
        <div className="container editorial-workspace-inner">
          <div className="editorial-workspace-photo">
            <DestinationImage
              src="/images/kyoto.jpg"
              alt="Traditional Kyoto street leading toward the Yasaka Pagoda"
              sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1344px) 48vw, 640px"
            />
          </div>
          <div className="editorial-workspace-copy">
            <Eyebrow>The trip workspace</Eyebrow>
            <h2>
              A home for the <em>whole adventure.</em>
            </h2>
            <p>
              Edit your itinerary, manage the trip budget and keep booking
              details in one place. Ask your trip-aware assistant for help and
              review its suggestions before applying changes.
            </p>
            <SectionLink href="/trips/preview">
              Preview the workspace
            </SectionLink>
            <p className="editorial-workspace-note">
              Eligible demo experiences use PayPal Sandbox. Changes and
              financial actions require separate approval.
            </p>
          </div>
        </div>
      </section>
      <section className="container editorial-section editorial-close">
        <h2>
          Where will you go <em>next?</em>
        </h2>
        <ButtonLink href="/trips/new">
          Plan my trip <ArrowUpRight size={18} aria-hidden="true" />
        </ButtonLink>
      </section>
    </div>
  );
}
