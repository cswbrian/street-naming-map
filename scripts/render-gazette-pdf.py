#!/usr/bin/env python3
"""Render gazette PDF pages to PNG for visual parsing (scanned/TIF2PDF notices).

Usage:
  python3 scripts/render-gazette-pdf.py path/to/notice.pdf
  python3 scripts/render-gazette-pdf.py path/to/notice.pdf --out /tmp/notice.png --dpi 300
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path, help="Input gazette PDF")
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output PNG path (default: /tmp/<pdf-stem>.png)",
    )
    parser.add_argument("--dpi", type=int, default=300, help="Render DPI (default: 300)")
    parser.add_argument("--page", type=int, default=0, help="Zero-based page index")
    args = parser.parse_args()

    if not args.pdf.is_file():
        print(f"File not found: {args.pdf}", file=sys.stderr)
        return 1

    try:
        import fitz  # PyMuPDF
    except ImportError:
        print("Install PyMuPDF: pip install pymupdf", file=sys.stderr)
        return 1

    out = args.out or Path("/tmp") / f"{args.pdf.stem}.png"
    doc = fitz.open(args.pdf)
    if args.page < 0 or args.page >= doc.page_count:
        print(f"Page {args.page} out of range (pages: {doc.page_count})", file=sys.stderr)
        return 1

    page = doc[args.page]
    text = page.get_text("text").strip()
    pix = page.get_pixmap(dpi=args.dpi)
    out.parent.mkdir(parents=True, exist_ok=True)
    pix.save(out)

    print(f"pages={doc.page_count}")
    print(f"page={args.page + 1}")
    print(f"text_chars={len(text)}")
    print(f"image={out}")
    if text:
        print("--- text ---")
        print(text[:4000])
    else:
        print("--- text ---")
        print("(empty — read the rendered PNG visually)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
