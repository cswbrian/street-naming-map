#!/usr/bin/env python3
"""Download HKGRO Hong Kong Government Gazette PDF scans by year.

HKGRO redirects first-time visitors to hknews.lib.hku.hk; request each year
page twice (with cookies) to reach browseGa.jsp.

Usage:
  python3 scripts/fetch-hkgro-gazette-pdfs.py --year-start 1927 --year-end 1930
  python3 scripts/fetch-hkgro-gazette-pdfs.py --year 1927 --dry-run
"""

from __future__ import annotations

import argparse
import http.cookiejar
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "data" / "hkgro" / "raw-pdfs"
BASE = "https://sunzi.lib.hku.hk/hkgro"
USER_AGENT = "Mozilla/5.0 (compatible; street-naming-map/1.0)"


def fetch_url(url: str, cookie_jar) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))
    with opener.open(req, timeout=120) as resp:
        return resp.read()


def fetch_year_index(year: int, cookie_jar) -> str:
    url = f"{BASE}/browseGa.jsp?the_year={year}"
    # First request may redirect to hknews; second reaches HKGRO TOC.
    fetch_url(url, cookie_jar)
    html_bytes = fetch_url(url, cookie_jar)
    return html_bytes.decode("utf-8", errors="replace")


def parse_pdf_links(html: str, year: int) -> list[tuple[str, str, str | None]]:
    """Return [(pdf_id, relative_path, title), ...] in TOC order."""
    current_date: str | None = None
    results: list[tuple[str, str, str | None]] = []
    for line in html.split("\n"):
        date_match = re.search(r"bgcolor=#46ffa0[^>]*>([^<]+)</td>", line)
        if date_match:
            current_date = date_match.group(1).strip()
        if "inputSubTitle" not in line:
            continue
        title_match = re.search(r">([^<]+)</a>", line)
        pdf_match = re.search(rf'href="(view/g{year}/(\d+)\.pdf)"', line)
        if not pdf_match:
            continue
        rel_path = pdf_match.group(1)
        pdf_id = pdf_match.group(2)
        title = title_match.group(1).strip() if title_match else None
        results.append((pdf_id, rel_path, title))
    return results


def download_pdf(year: int, pdf_id: str, out_dir: Path, cookie_jar, force: bool) -> bool:
    dest = out_dir / f"{pdf_id}.pdf"
    if dest.exists() and not force:
        return False
    url = f"{BASE}/view/g{year}/{pdf_id}.pdf"
    data = fetch_url(url, cookie_jar)
    if len(data) < 1000:
        raise RuntimeError(f"Suspiciously small PDF ({len(data)} bytes): {url}")
    dest.write_bytes(data)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Download HKGRO gazette PDFs by year")
    parser.add_argument("--year", type=int, action="append", help="Single year (repeatable)")
    parser.add_argument("--year-start", type=int, default=1927)
    parser.add_argument("--year-end", type=int, default=1930)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true", help="Re-download existing files")
    parser.add_argument("--sleep", type=float, default=0.15, help="Delay between PDF downloads")
    args = parser.parse_args()

    years = sorted(args.year) if args.year else list(range(args.year_start, args.year_end + 1))
    cookie_jar = http.cookiejar.CookieJar()

    manifest_path = args.out / "manifest.jsonl"
    args.out.mkdir(parents=True, exist_ok=True)

    total_new = 0
    total_skipped = 0
    total_failed = 0

    for year in years:
        print(f"\n=== {year} ===", flush=True)
        try:
            html = fetch_year_index(year, cookie_jar)
        except urllib.error.URLError as exc:
            print(f"  ERROR fetching index: {exc}", file=sys.stderr)
            total_failed += 1
            continue

        links = parse_pdf_links(html, year)
        print(f"  {len(links)} notices in TOC", flush=True)
        year_dir = args.out / f"g{year}"
        year_dir.mkdir(parents=True, exist_ok=True)

        if args.dry_run:
            for pdf_id, rel_path, title in links[:5]:
                print(f"  would download {rel_path} — {title}")
            if len(links) > 5:
                print(f"  ... and {len(links) - 5} more")
            continue

        with manifest_path.open("a", encoding="utf-8") as manifest:
            for i, (pdf_id, rel_path, title) in enumerate(links, 1):
                try:
                    downloaded = download_pdf(year, pdf_id, year_dir, cookie_jar, args.force)
                    if downloaded:
                        total_new += 1
                        manifest.write(
                            f'{{"year":{year},"pdf_id":"{pdf_id}","path":"{rel_path}","title":{title!r}}}\n'
                        )
                    else:
                        total_skipped += 1
                except Exception as exc:  # noqa: BLE001 — collect per-file failures
                    total_failed += 1
                    print(f"  FAIL {pdf_id}: {exc}", file=sys.stderr)
                if i % 50 == 0:
                    print(f"  progress {i}/{len(links)}", flush=True)
                if args.sleep:
                    time.sleep(args.sleep)

    print(
        f"\nDone. downloaded={total_new} skipped={total_skipped} failed={total_failed} "
        f"→ {args.out}",
        flush=True,
    )
    return 1 if total_failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
