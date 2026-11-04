import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Photography & credits" };

const photographers = [
  [
    "Cinque Terre, Italy",
    "Jack Ward",
    "jackward",
    "1516483638261-f4dbaf036963",
  ],
  ["Tokyo, Japan", "Jezael Melgoza", "jezael", "1540959733332-eab4deabeeaf"],
  ["Kyoto, Japan", "Sorasak", "boontohhgraphy", "1493976040374-85c8e12f0c0e"],
  [
    "Paris, France",
    "Chris Karidis",
    "chriskaridis",
    "1502602898657-3e91760cbb34",
  ],
  [
    "Santorini, Greece",
    "Ryan Spencer",
    "ryan_spencer",
    "1533105079780-92b9be482077",
  ],
  [
    "Lake Braies, Italy",
    "Luca Bravo",
    "lucabravo",
    "1476514525535-07fb3b4ae5f1",
  ],
];

export default function CreditsPage() {
  return (
    <div className="container page-content credits-page">
      <PageHeading
        eyebrow="THE PEOPLE BEHIND THE PICTURES"
        title="A window into somewhere new."
        description="Real photography makes room for real curiosity. Thank you to these photographers for sharing their work."
      />
      <div className="panel credits-panel">
        <h2>Destination photography</h2>
        <p>
          Photos from Unsplash, used under the{" "}
          <a href="https://unsplash.com/license">Unsplash License</a>.
          Photography is inspiration, not an endorsement, booking offer, or
          representation of live availability.
        </p>
        <ul className="credit-list">
          {photographers.map(([place, name, handle, photo]) => (
            <li key={place}>
              <strong>{place}</strong>
              <span>
                <a href={`https://unsplash.com/@${handle}`}>{name}</a> ·{" "}
                <a href={`https://images.unsplash.com/photo-${photo}`}>
                  Source photograph
                </a>
              </span>
            </li>
          ))}
        </ul>
        <h2>Typography & icons</h2>
        <p>
          Inter and Plus Jakarta Sans are locally served under the SIL Open Font
          License. Icons are by <a href="https://lucide.dev/license">Lucide</a>{" "}
          under the ISC License. License texts for the fonts are included with
          the source assets.
        </p>
      </div>
    </div>
  );
}
