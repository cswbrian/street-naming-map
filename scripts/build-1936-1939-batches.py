#!/usr/bin/env python3
"""Build and apply 1936–1939 HKGRO crowd naming batches."""

from __future__ import annotations

import csv
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BATCHES_DIR = ROOT / "data" / "crowdsubmissions" / "batches"
INBOX = ROOT / "data" / "crowdsubmissions" / "batch-inbox"
CSV_PATH = ROOT / "public" / "data" / "master" / "pending-naming-years.csv"
GEO_PATH = ROOT / "public" / "data" / "hk-streets.geojson"


def norm_en(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (text or "").upper())


def norm_zh(text: str) -> str:
    return re.sub(r"\s+", "", text or "")


def title_en(name: str) -> str:
    return " ".join(part.capitalize() for part in name.replace("-", " ").split())


EN_CODE_OVERRIDES: dict[str, tuple[str, str, str]] = {
    "Tung Cheung Street": ("13997", "TUNG CHEONG STREET", "東昌街"),
    "Tsat Tse Mui Road": ("12407", "TSAT TSZ MUI ROAD", "七姊妹道"),
}

SKIP: set[tuple[str, str]] = {
    ("1936-gn360-taipo-streets", "Main Street, Taipo"),
}

BATCHES = [
    {
        "batch_id": "1936-gn35-hoi-ping-road",
        "gn": 35,
        "date": "1936-01-10",
        "pdf": "/Users/coolsunwind/Downloads/225319.pdf",
        "streets": [("Hoi Ping Road", "開平道")],
    },
    {
        "batch_id": "1936-gn360-taipo-streets",
        "gn": 360,
        "date": "1936-04-17",
        "pdf": "/Users/coolsunwind/Downloads/226336.pdf",
        "streets": [
            ("Main Street, Taipo", "大埔大街"),
            ("Hei Yuen Street", "戲院街"),
            ("Tung Cheung Street", "東昌街"),
        ],
    },
    {
        "batch_id": "1936-gn885-kadoorie-braga",
        "gn": 885,
        "date": "1936-11-06",
        "pdf": "/Users/coolsunwind/Downloads/227920.pdf",
        "streets": [
            ("Kadoorie Avenue", "嘉道理道"),
            ("Braga Circuit", "布力架道"),
        ],
    },
    {
        "batch_id": "1936-gn918-hill-road",
        "gn": 918,
        "date": "1936-11-20",
        "pdf": "/Users/coolsunwind/Downloads/228019.pdf",
        "streets": [("Hill Road", "山道")],
        "rename_from": ("Clarence Street", None),
    },
    {
        "batch_id": "1936-gn1027-central-streets",
        "gn": 1027,
        "date": "1936-12-31",
        "pdf": "/Users/coolsunwind/Downloads/228349.pdf",
        "streets": [
            ("Theatre Lane", "戲院里"),
            ("Borrett Road", "波老道"),
        ],
    },
    {
        "batch_id": "1937-gn387-shaukiwan-streets",
        "gn": 387,
        "date": "1937-06-04",
        "pdf": "/Users/coolsunwind/Downloads/235595.pdf",
        "streets": [
            ("Holy Cross Path", "聖十字路"),
            ("Hoi Ning Street", "海寧街"),
            ("Hoi An Street", "海晏街"),
            ("Hoi Foo Street", "海富街"),
            ("Hoi Keung Street", "海強街"),
            ("Hoi Chiu Street", "海潮街"),
            ("Hing Man Street", "興民街"),
        ],
    },
    {
        "batch_id": "1937-gn682-island-roads",
        "gn": 682,
        "date": "1937-09-24",
        "pdf": "/Users/coolsunwind/Downloads/236576.pdf",
        "streets": [
            ("Shu Kuk Street", "書局街"),
            ("Kam Hong Street", "琴行街"),
            ("Marble Road", "馬寶道"),
            ("Pokfulam Reservoir Road", "薄扶林水塘道"),
            ("Deep Water Bay Road", "深水灣道"),
            ("Wong Ma Kok Road", "黃蔴角道"),
            ("Wong Chuk Hang Path", "黃竹坑徑"),
        ],
    },
    {
        "batch_id": "1938-gn299-tsuen-wan-streets",
        "gn": 299,
        "date": "1938-04-14",
        "pdf": "/Users/coolsunwind/Downloads/475875.pdf",
        "streets": [
            ("Chung On Street", "眾安街"),
            ("Market Street", "街市街"),
        ],
    },
    {
        "batch_id": "1939-gn341-kowloon-tong-roads",
        "gn": 341,
        "date": "1939-04-28",
        "pdf": "/Users/coolsunwind/Downloads/592682.pdf",
        "streets": [
            ("Ho Tung Road", "何東道"),
            ("Derby Road", "多庇道"),
            ("Flint Road", "芙蓮道"),
            ("Lancashire Road", "蘭開夏道"),
        ],
    },
    {
        "batch_id": "1939-gn489-sports-road",
        "gn": 489,
        "date": "1939-06-19",
        "pdf": "/Users/coolsunwind/Downloads/593138.pdf",
        "streets": [("Sports Road", "體育路")],
    },
    {
        "batch_id": "1939-gn1047-wan-chai-streets",
        "gn": 1047,
        "date": "1939-11-10",
        "pdf": "/Users/coolsunwind/Downloads/594842.pdf",
        "streets": [
            ("Wing Cheung Street", "永祥街"),
            ("Wing Ning Street", "永寧街"),
        ],
    },
    {
        "batch_id": "1939-gn1178-homestead-road",
        "gn": 1178,
        "date": "1939-12-15",
        "pdf": "/Users/coolsunwind/Downloads/595277.pdf",
        "streets": [("Homestead Road", "堪仕達道")],
    },
    {
        "batch_id": "1939-gn1179-north-point-streets",
        "gn": 1179,
        "date": "1939-12-15",
        "pdf": "/Users/coolsunwind/Downloads/595277.pdf",
        "streets": [
            ("Tsat Tse Mui Road", "七姊妹道"),
            ("Tin Chiu Street", "電照街"),
        ],
    },
]


def load_data():
    rows = list(csv.DictReader(CSV_PATH.open()))
    geo = json.load(GEO_PATH.open())
    codes_in_geo = {str(f["properties"]["STREETCODE"]) for f in geo["features"]}
    geo_by_code = {}
    for feature in geo["features"]:
        code = str(feature["properties"]["STREETCODE"])
        if code not in geo_by_code:
            geo_by_code[code] = feature["properties"]
    by_en: dict[str, list[dict]] = {}
    by_code = {r["street_code"]: r for r in rows}
    for row in rows:
        by_en.setdefault(norm_en(row["english_name"]), []).append(row)
    return by_en, by_code, codes_in_geo, geo_by_code


def match_street(gaz_en: str, gaz_zh: str, by_en: dict, by_code: dict):
    clean_en = gaz_en.replace(",", "")
    if clean_en in EN_CODE_OVERRIDES:
        code, db_en, db_zh = EN_CODE_OVERRIDES[clean_en]
        return by_code[code], db_en, db_zh

    keys = [
        norm_en(clean_en.replace("-", " ")),
        norm_en(clean_en.replace("'", "").replace("-", " ")),
    ]
    cands: list[dict] = []
    for key in keys:
        cands.extend(by_en.get(key, []))
    seen: set[str] = set()
    uniq: list[dict] = []
    for cand in cands:
        if cand["street_code"] not in seen:
            seen.add(cand["street_code"])
            uniq.append(cand)
    cands = uniq
    if not cands:
        return None, None, None

    for cand in cands:
        if norm_zh(cand["chinese_name"]) == norm_zh(gaz_zh):
            return cand, cand["english_name"], cand["chinese_name"]

    if len(cands) == 1:
        cand = cands[0]
        return cand, cand["english_name"], cand["chinese_name"]

    for cand in cands:
        if gaz_zh in cand["chinese_name"] or cand["chinese_name"] in gaz_zh:
            return cand, cand["english_name"], cand["chinese_name"]

    return None, None, None


def remarks(gaz_zh: str, db_zh: str) -> str | None:
    if norm_zh(gaz_zh) == norm_zh(db_zh):
        return None
    return f"Gazette ZH {gaz_zh}; database {db_zh}."


def build_history_entry(batch, gaz_en, gaz_zh, db_zh, submitter_remarks):
    gn = batch["gn"]
    date = batch["date"]
    year = date[:4]
    pdf_url = f"/egazette/en/{year}-gn{gn}.pdf"
    notice = f"Government Notification No. {gn}"
    clean_en = gaz_en.replace(",", "")

    rename_from = batch.get("rename_from")
    if rename_from and clean_en == batch["streets"][0][0].replace(",", ""):
        prev_en, prev_zh = rename_from
        entry = {
            "publication_date": date,
            "change_kind": "rename",
            "previous_street_name_en": prev_en,
            "street_name_en": title_en(clean_en),
            "street_name_zh": gaz_zh,
            "gazette_notice_label": notice,
            "government_notice_url_en": pdf_url,
            "evidence_level": "gazette",
            "is_declaration_event": False,
        }
        if prev_zh:
            entry["previous_street_name_zh"] = prev_zh
        if submitter_remarks:
            entry["submitter_remarks"] = submitter_remarks
        return entry

    entry = {
        "publication_date": date,
        "change_kind": "declare",
        "street_name_en": title_en(clean_en),
        "street_name_zh": gaz_zh,
        "gazette_notice_label": notice,
        "government_notice_url_en": pdf_url,
        "evidence_level": "gazette",
    }
    if submitter_remarks:
        entry["submitter_remarks"] = submitter_remarks
    return entry


def build_batch(batch, by_en, by_code, codes_in_geo, geo_by_code):
    batch_id = batch["batch_id"]
    gn = batch["gn"]
    date = batch["date"]
    year = date[:4]
    pdf_stem = f"{year}-gn{gn}"
    pdf_inbox = INBOX / batch_id / f"{pdf_stem}.pdf"

    applied = []
    skipped = []

    for gaz_en, gaz_zh in batch["streets"]:
        if (batch_id, gaz_en) in SKIP:
            skipped.append((gaz_en, gaz_zh, "manual_skip"))
            continue

        row, db_en, db_zh = match_street(gaz_en, gaz_zh, by_en, by_code)
        if not row:
            skipped.append((gaz_en, gaz_zh, "no_match"))
            continue

        code = row["street_code"]
        if code not in codes_in_geo:
            skipped.append((gaz_en, gaz_zh, "not_in_geo"))
            continue

        naming_year = geo_by_code[code].get("naming_year")
        if naming_year and int(naming_year) != int(year):
            skipped.append((gaz_en, gaz_zh, f"already_dated:{naming_year}"))
            continue

        submitter_remarks = remarks(gaz_zh, db_zh)
        applied.append(
            {
                "street_code": code,
                "english_name": db_en,
                "chinese_name": db_zh,
                "history": [
                    build_history_entry(batch, gaz_en, gaz_zh, db_zh, submitter_remarks)
                ],
            }
        )

    if not applied:
        return None, skipped

    payload = {
        "batch_id": batch_id,
        "source": "hkgro",
        "gazette_notice_label": f"Government Notification No. {gn}",
        "publication_date": date,
        "gazette_url_en": f"/egazette/en/{pdf_stem}.pdf",
        "pdf_en": str(pdf_inbox),
        "streets": applied,
    }
    return payload, skipped


def stage_pdf(batch):
    batch_id = batch["batch_id"]
    gn = batch["gn"]
    date = batch["date"]
    year = date[:4]
    pdf_stem = f"{year}-gn{gn}"
    dest_dir = INBOX / batch_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{pdf_stem}.pdf"
    if not dest.exists():
        shutil.copy2(batch["pdf"], dest)
    return dest


def main():
    apply = "--apply" in sys.argv
    by_en, by_code, codes_in_geo, geo_by_code = load_data()

    written = []
    all_skipped = []

    for batch in BATCHES:
        payload, skipped = build_batch(batch, by_en, by_code, codes_in_geo, geo_by_code)
        all_skipped.extend((batch["batch_id"], *s) for s in skipped)
        if not payload:
            print(f"SKIP batch {batch['batch_id']}: no applicable streets")
            continue

        stage_pdf(batch)
        out = BATCHES_DIR / f"{batch['batch_id']}.json"
        out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
        written.append(out)
        print(f"Wrote {out.name}: {len(payload['streets'])} streets, skipped {len(skipped)}")

        if apply:
            subprocess.run(
                ["node", "scripts/apply-crowd-batch.mjs", str(out)],
                cwd=ROOT,
                check=True,
            )

    if apply and written:
        public_en = ROOT / "public" / "egazette" / "en"
        public_zh = ROOT / "public" / "egazette" / "zh"
        for pdf in public_en.glob("193[6-9]-gn*.pdf"):
            zh = public_zh / pdf.name
            if not zh.exists():
                shutil.copy2(pdf, zh)

    total = sum(
        len(json.loads((BATCHES_DIR / f"{b['batch_id']}.json").read_text())["streets"])
        for b in BATCHES
        if (BATCHES_DIR / f"{b['batch_id']}.json").exists()
    )
    print(f"\nTotal streets in batches: {total}")
    if all_skipped:
        print("\nSkipped rows:")
        for bid, en, zh, reason in all_skipped:
            print(f"  {bid}: {en} / {zh} ({reason})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
