#!/usr/bin/env python3
"""Fast local text extraction. Only compact evidence is retained, not PDFs."""
import json
import sys
import fitz

with fitz.open(sys.argv[1]) as book:
    pages = []
    for index, page in enumerate(book):
        text = page.get_text(sort=True)
        if "OFFICIAL PLAY-BY-PLAY" in text and ("Challenge" in text or "challenge" in text):
            pages.append({"page": index + 1, "text": text})
    first = book[0].get_text(sort=True)
    officials = next((line.strip() for line in first.splitlines() if line.strip().startswith("Officials:")), "")
    print(json.dumps({"pages": pages, "officials": officials}))
