export type CuratedTrip = {
  id: string;
  city: string;
  country: string;
  title: string;
  description: string;
  image: string;
  alt: string;
  days: number;
  estimate: number;
  style: string;
  interests: string[];
  preview: string[];
};

/** Editorial seed content. Never treat these estimates as live provider data. */
export const curatedTrips: CuratedTrip[] = [
  {
    id: "tokyo",
    city: "Tokyo",
    country: "Japan",
    title: "A little lost in Tokyo",
    description:
      "Quiet gardens, neighborhood ramen, and a city that comes alive after dark.",
    image: "/images/tokyo.jpg",
    alt: "People crossing a neon-lit Tokyo street at night",
    days: 7,
    estimate: 1800,
    style: "City & culture",
    interests: ["Food", "Culture", "Shopping"],
    preview: [
      "Day 1 · Settle in and explore your neighborhood",
      "Day 2 · Gardens, galleries, and local flavors",
      "Day 3 · A different side of the city",
    ],
  },
  {
    id: "cinque-terre",
    city: "Monterosso al Mare",
    country: "Italy",
    title: "The Italian art of slowing down",
    description:
      "Make Monterosso your base for salt-air mornings and unhurried coastal afternoons.",
    image: "/images/cinque-terre.jpg",
    alt: "Colorful Cinque Terre village overlooking the Ligurian Sea",
    days: 5,
    estimate: 1400,
    style: "Coastal escape",
    interests: ["Relaxation", "Food", "Outdoors"],
    preview: [
      "Day 1 · Arrive in Monterosso",
      "Day 2 · An unhurried beach day",
      "Day 3 · Explore nearby coastal paths",
    ],
  },
  {
    id: "kyoto",
    city: "Kyoto",
    country: "Japan",
    title: "Find your quiet in Kyoto",
    description:
      "Temple paths, tea rituals, and small discoveries down lantern-lit lanes.",
    image: "/images/kyoto.jpg",
    alt: "Traditional Kyoto street with a pagoda in the distance",
    days: 5,
    estimate: 1200,
    style: "Slow & soulful",
    interests: ["Culture", "Art", "Relaxation"],
    preview: [
      "Day 1 · Wander your local streets",
      "Day 2 · Temple gardens and tea",
      "Day 3 · Craft and neighborhood discoveries",
    ],
  },
  {
    id: "paris",
    city: "Paris",
    country: "France",
    title: "Paris, at your own pace",
    description:
      "A neighborhood-first escape, with room for long lunches and a little art.",
    image: "/images/paris.jpg",
    alt: "The Eiffel Tower above Paris rooftops",
    days: 5,
    estimate: 1600,
    style: "Art & food",
    interests: ["Art", "Food", "Culture"],
    preview: [
      "Day 1 · A first neighborhood stroll",
      "Day 2 · Art and a long café afternoon",
      "Day 3 · Markets and riverside walks",
    ],
  },
  {
    id: "santorini",
    city: "Fira",
    country: "Greece",
    title: "Chasing the Aegean light",
    description:
      "Stay in Fira for whitewashed lanes, volcanic landscapes, and golden-hour views.",
    image: "/images/santorini.jpg",
    alt: "Whitewashed Santorini buildings overlooking the blue Aegean Sea",
    days: 5,
    estimate: 1500,
    style: "Coastal escape",
    interests: ["Relaxation", "Outdoors", "Food"],
    preview: [
      "Day 1 · Settle into Fira",
      "Day 2 · Village walks and caldera views",
      "Day 3 · A slower island afternoon",
    ],
  },
  {
    id: "dolomites",
    city: "Dobbiaco",
    country: "Italy",
    title: "Take the scenic route",
    description:
      "A single base in Dobbiaco for alpine lakes, mountain air, and a slower rhythm.",
    image: "/images/lake-braies.jpg",
    alt: "An alpine lake reflecting the mountains of the Italian Dolomites",
    days: 5,
    estimate: 1300,
    style: "Into the outdoors",
    interests: ["Outdoors", "Adventure", "Relaxation"],
    preview: [
      "Day 1 · Arrive in Dobbiaco",
      "Day 2 · An alpine lake excursion",
      "Day 3 · Choose a trail at your pace",
    ],
  },
];

export function getTemplate(id?: string) {
  return curatedTrips.find((trip) => trip.id === id);
}

export function curatedPlanningBrief(id?: string) {
  const template = getTemplate(id);
  return template
    ? {
        id: template.id,
        title: template.title,
        description: template.description,
        themes: template.preview,
        personalizationRule:
          "These are optional editorial ideas, not verified venues, schedules or prices. The user's current destination, dates, traveler count, budget, pace, selected interests and constraints take precedence over all template defaults. Adapt or omit themes that conflict. Never add another base city. Do not copy the template's illustrative budget or length.",
      }
    : undefined;
}

export const interests = [
  "Food",
  "Culture",
  "Outdoors",
  "Adventure",
  "Shopping",
  "Nightlife",
  "Art",
  "Relaxation",
  "Hidden gems",
  "Entertainment",
];
