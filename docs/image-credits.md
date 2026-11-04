# Photography and fonts

Local photography is sourced from Unsplash, used under the
[Unsplash License](https://unsplash.com/license). Source image URLs below identify
the actual assets. Photos are destination inspiration, not availability or an
endorsement of TravelRelay. No creator videos or social content are fabricated.

| Local file         | Photographer / source                                                                                                        | Depiction           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `cinque-terre.jpg` | [Jack Ward](https://unsplash.com/@jackward) · [source](https://images.unsplash.com/photo-1516483638261-f4dbaf036963)         | Cinque Terre, Italy |
| `tokyo.jpg`        | [Jezael Melgoza](https://unsplash.com/@jezael) · [source](https://images.unsplash.com/photo-1540959733332-eab4deabeeaf)      | Tokyo, Japan        |
| `kyoto.jpg`        | [Sorasak](https://unsplash.com/@boontohhgraphy) · [source](https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e)     | Kyoto, Japan        |
| `paris.jpg`        | [Chris Karidis](https://unsplash.com/@chriskaridis) · [source](https://images.unsplash.com/photo-1502602898657-3e91760cbb34) | Paris, France       |
| `santorini.jpg`    | [Ryan Spencer](https://unsplash.com/@ryan_spencer) · [source](https://images.unsplash.com/photo-1533105079780-92b9be482077)  | Santorini, Greece   |
| `lake-braies.jpg`  | [Luca Bravo](https://unsplash.com/@lucabravo) · [source](https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1)       | Lake Braies, Italy  |

Photos are downloaded at a bounded 1800px width, committed locally and served
through Next Image. A code-native neutral fallback appears if a photo fails.
`scripts/download-assets.py` records the source URLs for optional refreshes;
no remote image host is required at runtime.

Inter and Plus Jakarta Sans are distributed under the SIL Open Font License 1.1.
License texts are in `public/fonts/OFL-*.txt`. Source: [Google Fonts](https://github.com/google/fonts/tree/main/ofl).
