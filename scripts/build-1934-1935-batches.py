#!/usr/bin/env python3
"""Build and optionally apply 1934–1935 HKGRO crowd naming batches."""

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


# Manual EN -> (code, db_en, db_zh) when gazette English differs from database
EN_CODE_OVERRIDES: dict[str, tuple[str, str, str]] = {
    "Shung Yan Road": ("12106", "SHUNG YAN STREET", "崇仁街"),
}

# Skip gazette rows that must not be applied
SKIP: set[tuple[str, str]] = {
    ("1935-gn124-yuen-long-streets", "Tai Shing Street"),
}

BATCHES = [
    {
        "batch_id": "1934-gn91-cheung-sha-wan-streets",
        "gn": 91,
        "date": "1934-02-09",
        "pdf": "/Users/coolsunwind/Downloads/206642.pdf",
        "streets": [
            ("Shun Ning Road", "順寧道"),
            ("Po On Road", "普安道"),
            ("Wai Wai Road", "懷惠道"),
            ("Ping Lok Road", "平樂道"),
            ("Lin Chau Road", "連州道"),
            ("Kwong Lee Road", "廣利道"),
            ("Wing Hong Street", "永康街"),
            ("Kowloon Road", "九龍道"),
            ("Camp Street", "營盤街"),
            ("Pratas Street", "東沙島街"),
            ("Tonkin Street", "東京街"),
            ("Wing Lung Street", "永隆街"),
            ("Fat Tseung Street", "發祥街"),
            ("Cheung Fat Street", "長發街"),
            ("Hing Wah Street", "興華街"),
            ("Cheung Wah Street", "昌華街"),
            ("Hainan Street", "海南街"),
            ("Hung Cheung Street", "鴻昌街"),
        ],
    },
    {
        "batch_id": "1934-gn332-hysan-avenue",
        "gn": 332,
        "date": "1934-04-27",
        "pdf": "/Users/coolsunwind/Downloads/207464.pdf",
        "streets": [("Hysan Avenue", "希慎道")],
        "rename_from": ("Tung Shan Street", None),
    },
    {
        "batch_id": "1935-gn124-yuen-long-streets",
        "gn": 124,
        "date": "1935-02-15",
        "pdf": "/Users/coolsunwind/Downloads/216291.pdf",
        "streets": [
            ("Yuen Long Main Road", "元朗大路"),
            ("Tai San Street", "大新街"),
            ("Yat San Street", "日新街"),
            ("Yau San Street", "又新街"),
            ("Tsz Loi Street", "紫來街"),
            ("Fau Tsoi Street", "阜財街"),
            ("Hop Yik Street", "合益街"),
            ("Hop Shing Street", "合成街"),
            ("Hop Wo Hau Street", "合和後街"),
            ("Hop Wo Street", "合和街"),
            ("Hop Fat Street", "合發街"),
            ("Shiu Che Kwan Street", "水車館街"),
            ("Kuk Ting Street", "穀亭街"),
            ("Tai Tseung Street", "泰祥街"),
            ("Tai Fung Street", "泰豐街"),
            ("Tung Tai Street", "東堤街"),
            ("Tai Shing Street", "泰盛街"),
            ("Sai Tai Street", "西堤街"),
        ],
    },
    {
        "batch_id": "1935-gn165-kowloon-tong-streets",
        "gn": 165,
        "date": "1935-03-01",
        "pdf": "/Users/coolsunwind/Downloads/216414.pdf",
        "streets": [
            ("Shung Yan Road", "崇仁道"),
            ("College Road", "書院道"),
            ("Sau Chuk Yuen Road", "秀竹園道"),
            ("La Salle Road", "喇沙利道"),
            ("Pentland Street", "品蘭街"),
            ("Short Street", "述德街"),
        ],
    },
    {
        "batch_id": "1935-gn302-south-side-streets",
        "gn": 302,
        "date": "1935-04-12",
        "pdf": "/Users/coolsunwind/Downloads/216849.pdf",
        "streets": [
            ("Shek O Road", "石澳道"),
            ("Big Wave Bay Road", "大浪灣道"),
            ("Cape D'Aguilar Road", "鶴咀道"),
            ("South Bay Road", "南灣道"),
            ("Club Street", "會所街"),
            ("Hospital Path", "醫院徑"),
            ("Lloyd Path", "雷丹彌徑"),
            ("Beach Road", "海灘道"),
            ("Power Street", "大強道"),
        ],
    },
    {
        "batch_id": "1935-gn334-kowloon-streets",
        "gn": 334,
        "date": "1935-04-26",
        "pdf": "/Users/coolsunwind/Downloads/216945.pdf",
        "streets": [
            ("San Lau Street", "新柳街"),
            ("Shansi Street", "山西街"),
            ("Ho-nan Street", "河南街"),
            ("Kiang-hsi Street", "江西街"),
            ("Anhui Street", "安徽街"),
            ("Chi Kiang Street", "浙江街"),
            ("Kiang Su Street", "江蘇街"),
            ("Fukien Street", "福建街"),
            ("Lok Shan Road", "落山道"),
            ("Sheung Heung Road", "上鄉道"),
            ("Kwei Chow Street", "貴州街"),
            ("Sze Chuen Street", "四川街"),
            ("Bailey Street", "庇利街"),
            ("Kwangsi Street", "粵西街"),
            ("Kwang Tung Street", "粵東街"),
            ("Earl Street", "伯爵街"),
            ("Blenheim Avenue", "白蘭軒道"),
            ("Ichang Street", "宜昌街"),
        ],
    },
    {
        "batch_id": "1935-gn351-new-kowloon-streets",
        "gn": 351,
        "date": "1935-05-03",
        "pdf": "/Users/coolsunwind/Downloads/216996.pdf",
        "streets": [
            ("Kom Tsun Street", "甘泉街"),
            ("Kwong Cheung Street", "光昌街"),
            ("Tsap Fai Street", "集輝街"),
            ("Kwong Shing Street", "廣成街"),
            ("Yiu Tung Street", "耀東街"),
            ("Chuk Yuen Road", "竹園道"),
        ],
    },
    {
        "batch_id": "1935-gn490-causeway-bay-roads",
        "gn": 490,
        "date": "1935-06-21",
        "pdf": "/Users/coolsunwind/Downloads/217443.pdf",
        "streets": [
            ("King's Road", "英皇道"),
            ("Electric Road", "電氣道"),
            ("Tung Lo Wan Road", "銅鑼灣道"),
        ],
    },
    {
        "batch_id": "1935-gn767-po-yee-street",
        "gn": 767,
        "date": "1935-10-04",
        "pdf": "/Users/coolsunwind/Downloads/218301.pdf",
        "streets": [("Po Yee Street", "普義街")],
    },
    {
        "batch_id": "1935-gn768-lin-fa-kung-streets",
        "gn": 768,
        "date": "1935-10-04",
        "pdf": "/Users/coolsunwind/Downloads/218301.pdf",
        "streets": [
            ("Lin Fa Kung Street East", "蓮花宮東街"),
            ("Lin Fa Kung Street West", "蓮花宮西街"),
            ("Lily Street", "蓮花街"),
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
    return rows, by_en, by_code, codes_in_geo, geo_by_code


def match_street(gaz_en: str, gaz_zh: str, by_en: dict, by_code: dict):
    if gaz_en in EN_CODE_OVERRIDES:
        code, db_en, db_zh = EN_CODE_OVERRIDES[gaz_en]
        return by_code[code], db_en, db_zh

    keys = [norm_en(gaz_en.replace("-", " ")), norm_en(gaz_en.replace("'", "").replace("-", " "))]
    cands: list[dict] = []
    for key in keys:
        cands = by_en.get(key, [])
        if cands:
            break
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


def build_history_entry(
    batch: dict,
    gaz_en: str,
    gaz_zh: str,
    db_en: str,
    db_zh: str,
    submitter_remarks: str | None,
):
    gn = batch["gn"]
    date = batch["date"]
    year = date[:4]
    pdf_url = f"/egazette/en/{year}-gn{gn}.pdf"
    notice = f"Government Notification No. {gn}"

    rename_from = batch.get("rename_from")
    if rename_from and gaz_en == batch["streets"][0][0]:
        prev_en, prev_zh = rename_from
        entry = {
            "publication_date": date,
            "change_kind": "rename",
            "previous_street_name_en": prev_en,
            "street_name_en": title_en(gaz_en),
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
        "street_name_en": title_en(gaz_en),
        "street_name_zh": gaz_zh,
        "gazette_notice_label": notice,
        "government_notice_url_en": pdf_url,
        "evidence_level": "gazette",
    }
    if submitter_remarks:
        entry["submitter_remarks"] = submitter_remarks
    return entry


def build_batch(batch: dict, by_en, by_code, codes_in_geo, geo_by_code):
    batch_id = batch["batch_id"]
    gn = batch["gn"]
    date = batch["date"]
    year = date[:4]
    pdf_stem = f"{year}-gn{gn}"
    pdf_inbox = INBOX / batch_id / f"{pdf_stem}.pdf"
    pdf_src = Path(batch["pdf"])

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
                    build_history_entry(batch, gaz_en, gaz_zh, db_en, db_zh, submitter_remarks)
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


def stage_pdf(batch: dict):
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
    _, by_en, by_code, codes_in_geo, geo_by_code = load_data()

    written = []
    summary = []

    for batch in BATCHES:
        payload, skipped = build_batch(batch, by_en, by_code, codes_in_geo, geo_by_code)
        summary.append((batch["batch_id"], payload, skipped))
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
        for pdf in public_en.glob("193*-gn*.pdf"):
            zh = public_zh / pdf.name
            if not zh.exists():
                shutil.copy2(pdf, zh)

    total = sum(len(s[1]["streets"]) for s in summary if s[1])
    print(f"\nTotal streets in batches: {total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
