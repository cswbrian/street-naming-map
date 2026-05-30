#!/usr/bin/env python3
"""Build and optionally apply 1900–1930 HKGRO street-naming batches."""

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
PARSED = ROOT / "data" / "hkgro" / "street-naming" / "parsed-notices.json"
HKGRO_DIR = ROOT / "data" / "hkgro" / "street-naming"

EN_ALIASES: dict[str, str] = {
    "Taipo Road": "Tai Po Road",
    "Nullak Road": "Nullah Road",
    "Johnston Road": "Johnston Road",
    "Wing Wo Road": "Wing Wo Street",
    "Lo Lung Hang": "Lo Lung Hang Street",
    "Wa Fung Kai": "Wa Fung Street",
    "Sun Lau Street": "San Lau Street",
    "Kai Tack Bund": "Kai Tak Bund",
    "Sam Tack Road": "Sam Tak Road",
    "Yat Tack Road": "Yat Tak Road",
    "Yee Tack Road": "Yi Tak Road",
    "Kai Yan Road": "Kai Yan Road",
    "Kai Yee Road": "Kai Yi Road",
    "Om Yau Street": "Om Yau Street",
    "Julia Avenue": "Julia Avenue",
    "Ema Avenue": "Emma Avenue",
    "Luard Road": "Luard Road",
    "O'Brien Road": "O'Brien Road",
    "Stewart Road": "Stewart Road",
    "Tonnochy Road": "Tonnochy Road",
    "Prat Avenue": "Prat Avenue",
}


def norm_en(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (text or "").upper())


def norm_zh(text: str) -> str:
    return re.sub(r"\s+", "", text or "")


def title_en(name: str) -> str:
    return " ".join(part.capitalize() for part in name.replace("-", " ").split())


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:48] or "streets"


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
    lookup = EN_ALIASES.get(gaz_en, gaz_en)
    keys = [
        norm_en(lookup),
        norm_en(lookup.replace("'", "")),
        norm_en(lookup.replace("-", " ")),
    ]
    cands: list[dict] = []
    for key in keys:
        if key in by_en:
            cands = by_en[key]
            break
    if not cands:
        return None, None, None

    if gaz_zh:
        for cand in cands:
            if norm_zh(cand["chinese_name"]) == norm_zh(gaz_zh):
                return cand, cand["english_name"], cand["chinese_name"]

    if len(cands) == 1:
        cand = cands[0]
        return cand, cand["english_name"], cand["chinese_name"]

    if gaz_zh:
        for cand in cands:
            cz = norm_zh(cand["chinese_name"])
            gz = norm_zh(gaz_zh)
            if gz in cz or cz in gz:
                return cand, cand["english_name"], cand["chinese_name"]

    return None, None, None


def remarks(gaz_zh: str, db_zh: str) -> str | None:
    if not gaz_zh or not db_zh:
        return None
    if norm_zh(gaz_zh) == norm_zh(db_zh):
        return None
    return f"Gazette ZH {gaz_zh}; database {db_zh}."


def pdf_path_for(notice: dict) -> Path:
    return HKGRO_DIR / f"g{notice['year']}" / f"{notice['pdf_id']}.pdf"


def batch_id_for(notice: dict) -> str:
    year = notice["publication_date"][:4]
    gn = notice["gn"]
    first = notice["streets"][0]["en"] if notice["streets"] else notice["pdf_id"]
    return f"{year}-gn{gn}-{slugify(first)}"


def build_history(notice: dict, gaz_en: str, gaz_zh: str, submitter_remarks: str | None):
    gn = notice["gn"]
    date = notice["publication_date"]
    year = date[:4]
    pdf_url = f"/egazette/en/{year}-gn{gn}.pdf"
    label = f"Government Notification No. {gn}"
    kind = notice.get("change_kind", "declare")

    street = next((s for s in notice["streets"] if s["en"] == gaz_en), {})
    row_kind = street.get("change_kind", kind)

    if row_kind == "rename" and street.get("former_en"):
        entry = {
            "publication_date": date,
            "change_kind": "rename",
            "previous_street_name_en": street["former_en"],
            "street_name_en": title_en(gaz_en),
            "street_name_zh": gaz_zh,
            "gazette_notice_label": label,
            "government_notice_url_en": pdf_url,
            "evidence_level": "gazette",
            "is_declaration_event": False,
        }
    else:
        entry = {
            "publication_date": date,
            "change_kind": "declare",
            "street_name_en": title_en(gaz_en),
            "street_name_zh": gaz_zh,
            "gazette_notice_label": label,
            "government_notice_url_en": pdf_url,
            "evidence_level": "gazette",
        }
    if submitter_remarks:
        entry["submitter_remarks"] = submitter_remarks
    return entry


def build_batch(notice: dict, by_en, by_code, codes_in_geo, geo_by_code):
    if notice.get("skip"):
        return None, [], notice.get("skip_reason", "skipped")

    batch_id = batch_id_for(notice)
    gn = notice["gn"]
    date = notice["publication_date"]
    year = date[:4]
    pdf_stem = f"{year}-gn{gn}"
    pdf_src = pdf_path_for(notice)

    applied = []
    skipped = []
    flagged = list(notice.get("uncertainties") or [])

    for street in notice["streets"]:
        gaz_en = street["en"]
        gaz_zh = street.get("zh") or ""

        row, db_en, db_zh = match_street(gaz_en, gaz_zh, by_en, by_code)
        if not row:
            skipped.append((gaz_en, gaz_zh, "no_match"))
            continue
        code = row["street_code"]
        if code not in codes_in_geo:
            skipped.append((gaz_en, gaz_zh, "not_in_geo"))
            continue

        naming_year = geo_by_code[code].get("naming_year")
        if naming_year and int(naming_year) < int(year):
            skipped.append((gaz_en, gaz_zh, f"already_dated:{naming_year}"))
            continue
        if naming_year and int(naming_year) > int(year):
            flagged.append(f"{gaz_en}: database naming_year {naming_year} later than gazette {year}")

        sub = remarks(gaz_zh, db_zh)
        applied.append(
            {
                "street_code": code,
                "english_name": db_en,
                "chinese_name": db_zh,
                "history": [build_history(notice, gaz_en, gaz_zh or db_zh, sub)],
            }
        )

    if not applied:
        return None, skipped, flagged

    payload = {
        "batch_id": batch_id,
        "source": "hkgro",
        "gazette_notice_label": f"Government Notification No. {gn}",
        "publication_date": date,
        "gazette_url_en": f"/egazette/en/{pdf_stem}.pdf",
        "pdf_en": str(INBOX / batch_id / f"{pdf_stem}.pdf"),
        "streets": applied,
    }
    if flagged:
        payload["parse_flags"] = flagged

    if pdf_src.exists():
        dest_dir = INBOX / batch_id
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / f"{pdf_stem}.pdf"
        if not dest.exists():
            shutil.copy2(pdf_src, dest)

    return payload, skipped, flagged


def main():
    apply = "--apply" in sys.argv
    notices = json.loads(PARSED.read_text())
    by_en, by_code, codes_in_geo, geo_by_code = load_data()

    written = []
    report_rows = []
    deferred = []

    for notice in notices:
        if notice.get("skip"):
            deferred.append((notice["pdf_id"], notice.get("skip_reason", "skipped")))
            continue
        payload, skipped, flags = build_batch(notice, by_en, by_code, codes_in_geo, geo_by_code)
        gn = notice["gn"]
        date = notice["publication_date"]
        if not payload:
            deferred.append((notice["pdf_id"], f"no applicable streets ({len(skipped)} skipped)"))
            for gaz_en, gaz_zh, reason in skipped:
                report_rows.append(
                    {
                        "batch": batch_id_for(notice),
                        "gn": gn,
                        "date": date,
                        "gaz_en": gaz_en,
                        "gaz_zh": gaz_zh,
                        "code": "",
                        "geo": "",
                        "status": reason,
                    }
                )
            continue

        out = BATCHES_DIR / f"{payload['batch_id']}.json"
        out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
        written.append(out)

        for s in payload["streets"]:
            report_rows.append(
                {
                    "batch": payload["batch_id"],
                    "gn": gn,
                    "date": date,
                    "gaz_en": s["history"][0]["street_name_en"],
                    "gaz_zh": s["history"][0]["street_name_zh"],
                    "code": s["street_code"],
                    "geo": "✓",
                    "status": "applied",
                }
            )
        for gaz_en, gaz_zh, reason in skipped:
            report_rows.append(
                {
                    "batch": payload["batch_id"],
                    "gn": gn,
                    "date": date,
                    "gaz_en": gaz_en,
                    "gaz_zh": gaz_zh,
                    "code": "",
                    "geo": "",
                    "status": reason,
                }
            )
        if flags:
            for f in flags:
                report_rows.append(
                    {
                        "batch": payload["batch_id"],
                        "gn": gn,
                        "date": date,
                        "gaz_en": "",
                        "gaz_zh": "",
                        "code": "",
                        "geo": "",
                        "status": f"FLAG: {f}",
                    }
                )

        print(f"Wrote {out.name}: {len(payload['streets'])} streets, skipped {len(skipped)}")
        if apply:
            subprocess.run(["node", "scripts/apply-crowd-batch.mjs", str(out)], cwd=ROOT, check=True)

    if apply and written:
        public_en = ROOT / "public" / "egazette" / "en"
        public_zh = ROOT / "public" / "egazette" / "zh"
        for pdf in public_en.glob("*-gn*.pdf"):
            if pdf.name.startswith(("190", "191", "192")):
                zh = public_zh / pdf.name
                if not zh.exists():
                    shutil.copy2(pdf, zh)
        subprocess.run(["npm", "run", "merge:crowd"], cwd=ROOT, check=True)

    report_path = ROOT / "data" / "hkgro" / "street-naming" / "apply-report.json"
    report_path.write_text(
        json.dumps({"rows": report_rows, "deferred": deferred, "batches_written": len(written)}, indent=2)
        + "\n"
    )

    applied = sum(1 for r in report_rows if r["status"] == "applied")
    print(f"\nBatches written: {len(written)} | Streets applied: {applied} | Deferred PDFs: {len(deferred)}")
    print(f"Report: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
