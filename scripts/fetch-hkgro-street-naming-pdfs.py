#!/usr/bin/env python3
"""Download HKGRO street-naming gazette PDFs matched from hk-place pages.

Matches hk-place naming dates to HKGRO TOC titles by English road name
(one name from the notice usually appears in the browseGa link title).

Usage:
  python3 scripts/fetch-hkgro-street-naming-pdfs.py
  python3 scripts/fetch-hkgro-street-naming-pdfs.py --dry-run
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "hkgro" / "street-naming"
MANIFEST = OUT / "manifest.json"
BASE = "https://sunzi.lib.hku.hk/hkgro"
USER_AGENT = "Mozilla/5.0 (compatible; street-naming-map/1.0)"

HK_PLACE_PAGES = [
    (
        "https://web.archive.org/web/20111211014619/http://www.hk-place.com/view.php?id=355",
        "355",
        "1900-1920",
    ),
    (
        "https://web.archive.org/web/20111006012731/http://hk-place.com/view.php?id=341",
        "341",
        "1921-1926",
    ),
    (
        "https://web.archive.org/web/20111211024657/http://www.hk-place.com/view.php?id=356",
        "356",
        "1927-1930",
    ),
]

# hk-place date -> one or more (year, pdf_id, toc_title) when auto-match is unreliable
MANUAL: dict[str, list[tuple[int, str, str]]] = {
    "1901-05-11": [(1901, "461264", "Naming of a lane between houses Nos. 88 and 90, Wanchai Road")],
    "1905-03-17": [(1905, "539352", "Road through King's Park - Naming of")],
    "1908-02-07": [(1908, "8121", "Alterations in names of Roads in the Hill District")],
    "1909-07-23": [(1909, "12237", "Names for new streets in Shaukiwan")],
    "1919-09-26": [(1919, "61545", "Change of street names")],
    "1919-10-03": [(1919, "61559", "Alterations in names of certain streets")],
    "1920-03-19": [(1920, "66445", "Names of New Streets")],
    "1920-04-01": [(1920, "66485", "Li Chit Street")],
    "1929-11-29": [(1929, "563978", "Ho man Tin Street")],
    "1930-01-17": [
        (1930, "571119", "Dyer Avenue"),
        (1930, "571122", "Nullak Road, etc."),
    ],
    "1930-03-07": [(1930, "571443", "Village Road, etc.")],
    "1930-09-12": [(1930, "572811", "Ho Man Tin Hill Road")],
    "1930-10-24": [(1930, "573066", "On Lok Lane")],
}

EXCLUDE = re.compile(
    r"closing|closed|closure|bridge|alteration|widening|proposed closing|motor traffic|"
    r"re-entry|trade mark|arbitrator|resumption|cemetery|bathing beach|"
    r"treaty|ordinance|appointment|honou?r|meteorological|financial statement|"
    r"sunrise|sunset|competitive examination|pilotage|infected place|"
    r"colonial secretariat to occupy|colonial secretariat resumed|order under the streets|"
    r"auction sale|tenders for|land sale|resumed duty|to act as|to be a |to be an |"
    r"forest officer|dental register|pensions|hydifed|magistrate|coroner|"
    r"public latrine|watering the streets|supply of labour",
    re.I,
)

STREETISH = re.compile(
    r"street|road|lane|avenue|terrace|path|square|bund|fong|gardens|link|naming|names of",
    re.I,
)


def fetch_hk_place(url: str, cache_dir: Path) -> str:
    cache_dir.mkdir(parents=True, exist_ok=True)
    tag = re.search(r"id=(\d+)", url)
    path = cache_dir / f"hkplace-{tag.group(1) if tag else 'page'}.html"
    if not path.exists() or path.stat().st_size < 1000:
        subprocess.run(
            ["curl", "-sL", "-A", USER_AGENT, url, "-o", str(path)],
            check=True,
        )
    return path.read_text(encoding="utf-8", errors="replace")


def parse_hk_place(html: str) -> dict[str, list[str]]:
    groups: dict[str, list[str]] = defaultdict(list)
    rows = re.findall(r'<tr bgcolor="#F2F2F2">(.*?)</tr>', html, re.S)
    for row in rows:
        tds = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        tds = [re.sub(r"<[^>]+>", "", t) for t in tds]
        tds = [re.sub(r"\s+", " ", t).strip() for t in tds]
        if len(tds) < 4:
            continue
        date_raw, _zh, en, _area = tds[0], tds[1], tds[2], tds[3]
        m = re.match(r"(\d{4})\s*年\s*(\d+)\s*月\s*(\d+)\s*日", date_raw)
        if not m:
            continue
        iso = f"{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
        groups[iso].append(en)
    return groups


def fetch_toc(year: int, cache: dict[int, list], cookie_jar: http.cookiejar.CookieJar) -> list:
    if year in cache:
        return cache[year]
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))
    url = f"{BASE}/browseGa.jsp?the_year={year}"
    html = ""
    for _ in range(2):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with opener.open(req, timeout=120) as resp:
            html = resp.read().decode("utf-8", errors="replace")
    entries = []
    current_date = None
    for line in html.split("\n"):
        m = re.search(r"bgcolor=#46ffa0[^>]*>([^<]+)</td>", line)
        if m:
            current_date = m.group(1).strip()
        if "inputSubTitle" not in line:
            continue
        t = re.search(r">([^<]+)</a>", line)
        p = re.search(rf'href="view/g{year}/(\d+)\.pdf"', line)
        if t and p:
            entries.append((current_date, p.group(1), t.group(1).strip()))
    cache[year] = entries
    return entries


def parse_toc_date(s: str) -> datetime | None:
    try:
        return datetime.strptime(s, "%d-%b-%Y")
    except ValueError:
        return None


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def name_in_title(name: str, title: str) -> bool:
    nt, nn = norm(title), norm(name)
    if nn in nt:
        return True
    if nn.replace(" ", "") in nt.replace(" ", ""):
        return True
    parts = nn.split()
    for i in range(len(parts), 0, -1):
        if " ".join(parts[:i]) in nt:
            return True
    return False


def score_match(hk_date: str, name: str, toc_date: str, title: str) -> int:
    if EXCLUDE.search(title):
        return -1
    if not name_in_title(name, title):
        return -1
    if not STREETISH.search(title):
        return -1
    td = parse_toc_date(toc_date)
    hd = datetime.strptime(hk_date, "%Y-%m-%d")
    if not td:
        return -1
    days = abs((td - hd).days)
    if days > 28:
        return -1
    s = 100 - days
    tl = title.lower()
    if ", etc" in tl:
        s += 20
    if " and " in tl:
        s += 15
    if "naming of" in tl:
        s += 10
    return s


def match_all(groups: dict[str, list[str]]) -> tuple[list[dict], list[str]]:
    cookie_jar = http.cookiejar.CookieJar()
    toc_cache: dict[int, list] = {}
    matched: list[dict] = []
    unmatched: list[str] = []

    for hk_date in sorted(groups):
        names = groups[hk_date]
        if hk_date in MANUAL:
            for year, pdf_id, title in MANUAL[hk_date]:
                matched.append(
                    {
                        "hk_place_date": hk_date,
                        "street_count": len(names),
                        "sample_name": names[0],
                        "year": year,
                        "pdf_id": pdf_id,
                        "toc_date": None,
                        "toc_title": title,
                        "pdf_path": f"view/g{year}/{pdf_id}.pdf",
                        "manual": True,
                    }
                )
            continue

        year = int(hk_date[:4])
        toc = fetch_toc(year, toc_cache, cookie_jar)
        best = None
        for name in names:
            for toc_date, pdf_id, title in toc:
                sc = score_match(hk_date, name, toc_date, title)
                if sc >= 0 and (best is None or sc > best[0]):
                    best = (sc, toc_date, pdf_id, title, name)
        if best:
            matched.append(
                {
                    "hk_place_date": hk_date,
                    "street_count": len(names),
                    "sample_name": best[4],
                    "year": year,
                    "pdf_id": best[2],
                    "toc_date": best[1],
                    "toc_title": best[3],
                    "pdf_path": f"view/g{year}/{best[2]}.pdf",
                    "manual": False,
                }
            )
        else:
            unmatched.append(hk_date)

    return matched, unmatched


def ensure_year_session(year: int, cookie_jar: http.cookiejar.CookieJar) -> None:
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))
    url = f"{BASE}/browseGa.jsp?the_year={year}"
    for _ in range(2):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with opener.open(req, timeout=120) as resp:
            resp.read()


def download_pdf(entry: dict, cookie_jar: http.cookiejar.CookieJar, out_dir: Path, force: bool) -> bool:
    year = entry["year"]
    pdf_id = entry["pdf_id"]
    dest = out_dir / f"g{year}" / f"{pdf_id}.pdf"
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and not force:
        entry["local_path"] = str(dest.relative_to(ROOT))
        return False
    ensure_year_session(year, cookie_jar)
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))
    url = f"{BASE}/view/g{year}/{pdf_id}.pdf"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with opener.open(req, timeout=120) as resp:
        data = resp.read()
    if len(data) < 1000:
        raise RuntimeError(f"Suspiciously small PDF ({len(data)} bytes): {url}")
    dest.write_bytes(data)
    entry["local_path"] = str(dest.relative_to(ROOT))
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--sleep", type=float, default=0.2)
    args = parser.parse_args()

    cache_dir = OUT / "cache"
    all_groups: dict[str, list[str]] = {}
    for url, page_id, label in HK_PLACE_PAGES:
        html = fetch_hk_place(url, cache_dir)
        groups = parse_hk_place(html)
        for date, names in groups.items():
            all_groups.setdefault(date, []).extend(names)

    matched, unmatched = match_all(all_groups)

    print(f"hk-place naming dates: {len(all_groups)}")
    print(f"matched HKGRO PDFs: {len(matched)}")
    if unmatched:
        print(f"unmatched: {unmatched}", file=sys.stderr)

    unique = {}
    for entry in matched:
        key = (entry["year"], entry["pdf_id"])
        unique[key] = entry

    for entry in sorted(unique.values(), key=lambda e: e["hk_place_date"]):
        print(
            f"  {entry['hk_place_date']}  g{entry['year']}/{entry['pdf_id']}.pdf  "
            f"({entry['toc_date'] or 'manual'})  {entry['toc_title']}"
        )

    manifest = {
        "source_pages": [p[0] for p in HK_PLACE_PAGES],
        "entries": sorted(unique.values(), key=lambda e: e["hk_place_date"]),
    }

    if args.dry_run:
        return 1 if unmatched else 0

    OUT.mkdir(parents=True, exist_ok=True)
    cookie_jar = http.cookiejar.CookieJar()
    downloaded = 0
    failed = 0
    for entry in manifest["entries"]:
        try:
            if download_pdf(entry, cookie_jar, OUT, args.force):
                downloaded += 1
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"  FAIL g{entry['year']}/{entry['pdf_id']}.pdf: {exc}", file=sys.stderr)
        if args.sleep:
            time.sleep(args.sleep)

    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nDownloaded {downloaded} new PDFs, {failed} failed → {OUT}")
    print(f"Manifest → {MANIFEST}")
    return 1 if unmatched or failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
