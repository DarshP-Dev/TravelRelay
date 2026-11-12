// Synthetic Google wire fixtures. No review text, identity, or rating came from Google.
export const parisPlace = {
  id: "offline-paris-museum",
  displayName: { text: "Musée d'Orsay" },
  formattedAddress: "Esplanade Valéry Giscard d’Estaing, 75007 Paris, France",
  addressComponents: [
    { longText: "Paris", types: ["locality"] },
    { longText: "France", shortText: "FR", types: ["country"] },
  ],
  location: { latitude: 48.86, longitude: 2.3266 },
  primaryType: "museum",
  types: ["museum", "tourist_attraction"],
};

export const parisPlaceDetails = {
  id: parisPlace.id,
  displayName: parisPlace.displayName,
  formattedAddress: parisPlace.formattedAddress,
  googleMapsUri: "https://www.google.com/maps/place/Offline+Fixture",
  rating: 4.6,
  userRatingCount: 1240,
  attributions: [
    {
      provider: "Offline fixture data",
      providerUri: "https://example.com/fixture",
    },
  ],
  reviews: [
    "The Impressionist rooms were the highlight. I spent extra time on the upper floor and appreciated having an unrushed morning.",
    "The former station is worth taking in before you head to the galleries. I liked pausing by the clock between floors.",
    "A useful stop for a rainy afternoon. I would set aside time for the building as well as the paintings.",
    "I followed one gallery at a time and found the visit easier to pace.",
    "The sculpture hall made a quiet break between the busier rooms.",
  ].map((text, i) => ({
    rating: i % 2 ? 4 : 5,
    originalText: { text: `Offline QA sample. ${text}` },
    publishTime: "2025-09-07T12:34:56Z",
    googleMapsUri: `https://www.google.com/maps/reviews/data=offline-fixture-${i}`,
    authorAttribution: {
      displayName: `Sample traveler ${i + 1}`,
      uri: `https://www.google.com/maps/contrib/offline-fixture-${i}`,
      ...(i === 0
        ? {
            photoUri:
              "https://lh3.googleusercontent.com/offline-fixture-avatar",
          }
        : {}),
    },
  })),
};
