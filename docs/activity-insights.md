# Activity Insights

On a saved itinerary, **What travelers are saying** appears directly below the
activity description. Choose **Show traveler reviews** to look up that venue.
The existing description, edit workflow, and trip budget stay in the itinerary.
Google ratings, published excerpts, and source links appear in a separate panel.
The first two reviews are visible, with up to three more behind an expansion.

## Matching and data boundaries

- The same-origin POST requires a Better Auth session, the owned trip and
  activity IDs, and the saved itinerary revision. The server resolves the venue
  from the saved activity. A stale revision requires a reload. A request never
  accepts an arbitrary venue, Google place ID, or provider URL from the client.
- Generic walks, unnamed dining, street-only locations, and transport are
  ineligible. Text Search (New) retrieves up to five candidate identities,
  address components, coordinates, and types. Matching requires an exact
  normalized venue name, city and country agreement, compatible venue type,
  proximity to the saved base and any activity coordinates, and agreement with
  any explicit saved street address. With missing activity coordinates, the
  locality and base-city checks still apply. Multiple qualifying IDs require
  the user to check Google Maps. Locale aliases, alternative spellings and
  noncanonical addresses can cause a genuine venue to go unmatched.
- Place Details (New) is requested only for a single accepted ID. Direct review
  URLs and author names are required for inline excerpts. A rating may be
  missing, and the returned sample may be empty. Ratings and review excerpts
  provide traveler opinions. Confirm accessibility, hours, prices and inventory
  independently.
- Google content is rendered only in the itinerary card view or under the
  schedule when the map is closed. The Leaflet/OpenStreetMap view has its own
  existing coordinates and shows no Google results. Google data does not enter
  the itinerary, database, edit history, assistant context, or persistent
  browser storage. The current mounted activity keeps the result long enough to
  display and expand it. Opening the map, changing days, or saving a revision clears that view
  state. API responses use `Cache-Control: no-store`.
- The existing assistant can propose edits through its existing preview and
  approval workflow. It has no access to Google or social evidence. An
  evidence-aware assistant would need its own provider-policy review before any
  review data could be shared with a model or persisted in chat.

## Social inspiration

**See the experience** shows HTTPS references saved through the existing activity
editor, with Instagram and TikTok source labels. The optional TikTok search opens
the platform with only the saved venue name and city when clicked. The app
does not fetch posts, verify their availability, embed trackers, or copy content.
Instagram references require a known public URL. An external post can become
private, unavailable, or require a platform login.

TikTok’s Display API requires an authorized creator account. Its Research API
has eligibility and approval requirements. Official embeds also start from a
known post. Instagram's oEmbed is for known post URLs and requires Meta app
access. None of these flows is used for discovery here. See the [TikTok Display
API](https://developers.tiktok.com/docs/en/display-api-get-started), [Research
Tools FAQ](https://developers.tiktok.com/docs/en/research-api-faq), [TikTok
Embed Player](https://developers.tiktok.com/docs/en/embed-player), and [Meta
Instagram oEmbed](https://developers.facebook.com/docs/instagram/oembed/).

## Cost and usage limits

The [Google global price list](https://developers.google.com/maps/billing-and-pricing/pricing)
and [Places SKU field list](https://developers.google.com/maps/billing-and-pricing/sku-details/places)
list the following standard rates at the first paid volume tier.

| Request                    | Highest field-mask SKU                | Monthly no-charge cap per billing account | USD per 1,000 above cap |
| -------------------------- | ------------------------------------- | ----------------------------------------: | ----------------------: |
| Text Search                | Text Search Pro                       |                                     5,000 |                     $32 |
| Place Details with reviews | Place Details Enterprise + Atmosphere |                                     1,000 |                     $25 |

Identity, address, location and type fields require the Text Search Pro mask.
Ratings/counts alone can trigger Place Details Enterprise ($20/1,000 at the
first paid tier). Reviews move the single Details request to Enterprise +
Atmosphere. No photos, wildcard fields, pagination or automatic retries are
requested. One successful lookup has a list cost of **$0.057 USD** before
no-charge caps. A search without an accepted match has a list cost of **$0.032**.
For 100 successful demo lookups, the list-cost ceiling is **$5.70** before
allowances, or **$0** if both no-charge caps are still available. Default app
limits admit at most 620 lookups in a 31-day month, or **$35.34** if both
allowances are already exhausted. This estimate excludes taxes and usage by
other clients. Google aggregates usage across projects on the same billing
account. Confirm the actual quotas and billing region before activation.

The server reserves one lookup atomically in the existing database quota table
before contacting Google. It allows three admitted lookups per minute across
the deployment, five per user per hour, and at most twenty per UTC day. A
45-second activity cooldown stops duplicate requests across tabs and instances.
The shared daily limit can be lowered to one for acceptance. Searches and
Details share one seven-second provider deadline. Counters are independent of
the AI generation quota and do not store review content. Provider telemetry
records only outcome, attempted request counts, duration, and estimated list
cost. Google Cloud billing metrics are authoritative for charges.

## Before live activation

1. Obtain separate approval for a controlled live test and billing setup. Create
   or select a Google Cloud project, attach its billing account, and enable
   **Places API (New)**. Set low per-method quotas and a billing budget with
   alert thresholds. Budget alerts send notifications. API quota settings and
   the application caps constrain request counts.
2. Review the [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies)
   and any EEA terms that apply to the billing address. Publish TravelRelay
   Terms of Use and a Privacy Policy incorporating the relevant [Google terms](https://www.google.com/intl/en/policies/terms/)
   and [Google privacy policy](https://www.google.com/policies/privacy/). Verify
   that the privacy notice covers venue lookups and that both pages are publicly
   accessible. TravelRelay has yet to publish those pages for this integration.
3. Create a dedicated server API key restricted to Places API (New). Apply an
   IP restriction where the approved backend has a stable egress address, per
   [Google security guidance](https://developers.google.com/maps/api-security-best-practices).
   Vercel's managed Static IPs require a paid plan. The simplest controlled test
   is a local server on an approved egress IP. Hosted activation needs a separate
   decision on how to restrict and protect the key. See [Vercel backend egress](https://vercel.com/academy/optimize-your-vercel-account/backend-egress).
4. Keep `GOOGLE_PLACES_API_KEY` in ignored local configuration or approved
   server-side deployment secrets. Set `ACTIVITY_INSIGHTS_DAILY_LIMIT=1` and
   `ACTIVITY_INSIGHTS_ENABLED=true` for the isolated acceptance environment.
   A missing key, invalid limit, or unset flag keeps the Google provider off.
   Vercel needs these values only for a separately approved deployment. No new
   database migration or public environment variable is required.
5. Open one saved activity with a known venue, such as Musée d’Orsay, and choose
   **Show traveler reviews** once. Verify venue identity, source-linked excerpts,
   author/avatar/profile, the official Google Maps logo, any returned third-party
   attribution, and desktop/mobile contrast. Compare the provider's recorded
   usage and cost with the expected Search and Details requests. Test the
   keyless fallback by disabling the feature again. Keep the default off until
   the hosted settings and compliance review are approved.

The Google Maps attribution asset is the unmodified Dark Gray SVG from the
[official attribution bundle](https://developers.google.com/maps/documentation/places/web-service/policies#logo-attribution).
In the panel, it sits next to the supplied venue information. Each shown
review links to its original, and the associated author name, profile, avatar,
rating and publication time are displayed when provided and usable.
