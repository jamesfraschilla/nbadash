#!/usr/bin/env python3
"""Extract only official PBP pages; no PDF or full gamebook is stored in Supabase."""
import json
import sys
import pdfplumber

with pdfplumber.open(sys.argv[1]) as book:
    pages = []
    for index, page in enumerate(book.pages):
        text = page.extract_text() or ""
        if "OFFICIAL PLAY-BY-PLAY" in text and ("Challenge" in text or "challenge" in text):
            pages.append({"page": index + 1, "text": text})
    print(json.dumps(pages))
