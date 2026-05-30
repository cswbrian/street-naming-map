#!/usr/bin/env python3
"""Build and apply 1940–1941 HKGRO crowd naming batches."""

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
CSV_PATH = ROOT / "public/data/master/pending-naming-years.csv"
GEO_PATH = ROOT / "public/data/hk-streets.geojson"


def norm_en(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (text or "").upper())


def norm_zh(text: str) -> str:
    return re.sub(r"\s+", "", text or "")


def title_en(name: str) -> str:
    return " ".join(part.capitalize() for part in name.replace("-", " ").split())


EN_CODE_OVERRIDES: dict[str, tuple[str, str, str]] = {
    "Siu Wo Street": ("12068", "SHIU WO STREET", "兆和街"),
}

BATCHES = [
    {
        "batch_id": "1940-gn108-siu-wo-street",
        "gn": 108,
        "date": "1940-01-19",
        "pdf": "/Users/coolsunwind/Downloads/580411.pdf",
        "streets": [("Siu Wo Street", "兆和街")],
    },
    {
        "batch_id": "1940-gn154-happy-valley-roads",
        "gn": 154,
        "date": "1940-02-07",
        "pdf": "/Users/coolsunwind/Downloads/580555.pdf",
        "streets": [
            ("Hawthorn Road", "荷塘道"),
            ("Holly Road", "冬青道"),
            ("Green Lane", "箕璉坊"),
            ("Broom Road", "蟠龍道"),
            ("Briar Avenue", "比雅道"),
        ],
    },
    {
        "batch_id": "1940-gn479-shouson-hill-roads",
        "gn": 479,
        "date": "1940-04-26",
        "pdf": "/Users/coolsunwind/Downloads/581536.pdf",
        "streets": [
            ("Shouson Hill Road West", "壽臣山道西"),
            ("Shouson Hill Road East", "壽臣山道東"),
        ],
    },
    {
        "batch_id": "1940-gn1181-chuk-yuen-road-west",
        "gn": 1181,
        "date": "1940-10-25",
        "pdf": "/Users/coolsunwind/Downloads/583744.pdf",
        "streets": [("Chuk Yuen Road West", "竹園西道")],
    },
    {
        "batch_id": "1941-gn870-tai-hang-streets",
        "gn": 870,
        "date": "1941-07-18",
        "pdf": "/Users/coolsunwind/Downloads/304715.pdf",
        "streets": [
            ("Ormsby Street", "安庶庇道"),
            ("Brown Street", "寶現街"),
        ],
    },
    {
        "batch_id": "1941-gn1260-ferry-street",
        "gn": 1260,
        "date": "1941-10-24",
        "pdf": "/Users/coolsunwind/Downloads/305921.pdf",
        "streets": [("Ferry Street", "渡船街")],
    },
    {
        "batch_id": "1941-gn1261-aberdeen-streets",
        "gn": 1261,
        "date": "1941-10-24",
        "pdf": "/Users/coolsunwind/Downloads/305921.pdf",
        "streets": [
            ("Lok Yeung Street", "洛陽街"),
            ("Chengtu Road", "成都道"),
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
    if gaz_en in EN_CODE_OVERRIDES:
        code, db_en, db_zh = EN_CODE_OVERRIDES[gaz_en]
        return by_code[code], db_en, db_zh

    keys = [
        norm_en(gaz_en.replace("-", " ")),
        norm_en(gaz_en.replace("'", "").replace("-", " ")),
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


def build_history_entry(batch, gaz_en, gaz_zh, submitter_remarks):
    gn = batch["gn"]
    date = batch["date"]
    year = date[:4]
    pdf_url = f"/egazette/en/{year}-gn{gn}.pdf"
    notice = f"Government Notification No. {gn}"
    entry = {
        "publication_date": date,
        "change_kind": "declare",
        "street_name_en": title_en(gaz_en),
        "street_name_zh": gaz_zh,
        "gazette_notice_label": notice,
        "government_notice_url_en": pdf_url,
        "evidence_level": "gazette",
    }
    if submitter_remarks:
        entry["submitter_remarks"] = submitter_remarks
    return entry


def build_batch(batch, by_en, by_code, codes_in_geo, geo_by_code):
    gn = batch["gn"]
    date = batch["date"]
    year = date[:4]
    pdf_stem = f"{year}-gn{gn}"
    pdf_inbox = INBOX / batch["batch_id"] / f"{pdf_stem}.pdf"

    applied = []
    skipped = []

    for gaz_en, gaz_zh in batch["streets"]:
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
                    build_history_entry(batch, gaz_en, gaz_zh, submitter_remarks)
                ],
            }
        )

    if not applied:
        return None, skipped

    payload = {
        "batch_id": batch["batch_id"],
        "source": "hkgro",
        "gazette_notice_label": f"Government Notification No. {gn}",
        "publication_date": date,
        "gazette_url_en": f"/egazette/en/{pdf_stem}.pdf",
        "pdf_en": str(pdf_inbox),
        "streets": applied,
    }
    return payload, skipped


def stage_pdf(batch):
    gn = batch["gn"]
    date = batch["date"]
    year = date[:4]
    pdf_stem = f"{year}-gn{gn}"
    dest_dir = INBOX / batch["batch_id"]
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{pdf_stem}.pdf"
    if not dest.exists():
        shutil.copy2(batch["pdf"], dest)
    return dest


def main():
    apply = "--apply" in sys.argv
    by_en, by_code, codes_in_geo, geo_by_code = load_data()

    all_skipped = []
    total = 0

    for batch in BATCHES:
        payload, skipped = build_batch(batch, by_en, by_code, codes_in_geo, geo_by_code)
        all_skipped.extend((batch["batch_id"], *s) for s in skipped)
        if not payload:
            print(f"SKIP batch {batch['batch_id']}: no applicable streets")
            continue

        stage_pdf(batch)
        out = BATCHES_DIR / f"{batch['batch_id']}.json"
        out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
        total += len(payload["streets"])
        print(f"Wrote {out.name}: {len(payload['streets'])} streets, skipped {len(skipped)}")

        if apply:
            subprocess.run(
                ["node", "scripts/apply-crowd-batch.mjs", str(out)],
                cwd=ROOT,
                check=True,
            )

    if apply:
        public_en = ROOT / "public" / "egazette" / "en"
        public_zh = ROOT / "public" / "egazette" / "zh"
        for pdf in public_en.glob("194[01]-gn*.pdf"):
            zh = public_zh / pdf.name
            if not zh.exists():
                shutil.copy2(pdf, zh)

    print(f"\nTotal streets in batches: {total}")
    if all_skipped:
        print("\nSkipped rows:")
        for bid, en, zh, reason in all_skipped:
            print(f"  {bid}: {en} / {zh} ({reason})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
