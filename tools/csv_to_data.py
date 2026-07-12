#!/usr/bin/env python3
"""Convert the SMLE master CSV into js/data.js for the study app.

Usage: python3 tools/csv_to_data.py path/to/questions.csv
"""
import csv
import json
import sys
from pathlib import Path


def convert(csv_path: str) -> str:
    questions = []
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            ans = row["Answer"].strip().upper()
            if ans not in "ABCD" or not row["Question"].strip():
                continue
            buzz = [b.strip() for b in row.get("Buzzwords (Key Clues)", "").split("|") if b.strip()]
            questions.append({
                "id": int(row["Master_Q_Number"]),
                "cat": row["Category"].strip(),
                "sub": row["Subcategory"].strip(),
                "q": row["Question"].strip(),
                "buzz": buzz,
                "opts": [row["Option_A"].strip(), row["Option_B"].strip(),
                         row["Option_C"].strip(), row["Option_D"].strip()],
                "ans": "ABCD".index(ans),
                "expl": [row["Explanation_A"].strip(), row["Explanation_B"].strip(),
                         row["Explanation_C"].strip(), row["Explanation_D"].strip()],
                "hy": row.get("High_Yield_Must_Know", "").strip(),
                "one": row.get("one line", "").strip(),
            })
    return "const SMLE_DATA = " + json.dumps(questions, ensure_ascii=False) + ";\n"


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "data/SMLE_Master.csv"
    out = Path(__file__).resolve().parent.parent / "js" / "data.js"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(convert(src), encoding="utf-8")
    print(f"Wrote {out}")
