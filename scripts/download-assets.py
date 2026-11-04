"""Download the explicitly selected public photos and open-licensed fonts.

Optional maintenance script; normal installation/build never requires this.
See docs/image-credits.md and public/fonts/OFL-*.txt for attribution/licenses.
"""

from pathlib import Path
import re
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
PHOTOS = {
    "cinque-terre": "1516483638261-f4dbaf036963",
    "tokyo": "1540959733332-eab4deabeeaf",
    "kyoto": "1493976040374-85c8e12f0c0e",
    "paris": "1502602898657-3e91760cbb34",
    "santorini": "1533105079780-92b9be482077",
    "lake-braies": "1476514525535-07fb3b4ae5f1",
}


def fetch(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"})
    with urlopen(request, timeout=60) as response:
        return response.read()


def main() -> None:
    images = ROOT / "public" / "images"
    fonts = ROOT / "public" / "fonts"
    images.mkdir(parents=True, exist_ok=True)
    fonts.mkdir(parents=True, exist_ok=True)
    for name, photo in PHOTOS.items():
        target = images / f"{name}.jpg"
        if not target.exists():
            target.write_bytes(fetch(
                f"https://images.unsplash.com/photo-{photo}?auto=format&fit=crop&w=1800&q=85&fm=jpg"
            ))
        print(f"Photo ready: {name}")

    for family, slug, upstream, weights in [
        ("Inter", "inter", "inter", "100..900"),
        ("Plus+Jakarta+Sans", "plus-jakarta-sans", "plusjakartasans", "200..800"),
    ]:
        css = fetch(f"https://fonts.googleapis.com/css2?family={family}:wght@{weights}&display=swap").decode()
        # Select the variable font's Latin subset; system fallbacks cover other scripts.
        blocks = css.split("/* latin */")
        latin = blocks[-1]
        url = re.search(r"url\((https://[^)]+)\)", latin)
        if not url:
            raise RuntimeError(f"No font URL found for {family}")
        (fonts / f"{slug}.woff2").write_bytes(fetch(url.group(1)))
        license_url = f"https://raw.githubusercontent.com/google/fonts/main/ofl/{upstream}/OFL.txt"
        license_text = fetch(license_url).decode("utf-8")
        (fonts / f"OFL-{slug}.txt").write_text(
            "\n".join(line.rstrip() for line in license_text.splitlines()) + "\n",
            encoding="utf-8",
        )
        print(f"Font and license ready: {slug}")


if __name__ == "__main__":
    main()
