#!/usr/bin/env python3
"""Apply authored explanation/high-yield/one-line corrections to the master CSV.

A block of 97 questions had their Explanation_A-D, High_Yield_Must_Know, and
'one line' fields overwritten with a copy of the question 40 rows below. Their
options/answers/stems are intact; this restores correct explanatory content
(authored from each intact stem + answer key) from tools/corrections.json.
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV = ROOT / "data" / "SMLE_Master.csv"
CORR = json.load(open(Path(__file__).resolve().parent / "corrections.json"))

rows = list(csv.DictReader(open(CSV, newline="", encoding="utf-8-sig")))
fields = rows[0].keys()
byid = {r["Master_Q_Number"]: r for r in rows}

applied = 0
for qid, c in CORR.items():
    r = byid[qid]
    for letter in "ABCD":
        r[f"Explanation_{letter}"] = c[letter]
    r["High_Yield_Must_Know"] = c["hy"]
    r["one line"] = c["one"]
    applied += 1

with open(CSV, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(fields))
    w.writeheader()
    w.writerows(rows)

print(f"Applied corrections to {applied} questions.")

# ---- validation ----
def norm(s):
    return " ".join(s.lower().split())

# no corrected row should still duplicate its +40 partner's explanations
bad = []
for qid in CORR:
    partner = str(int(qid) + 40)
    if partner in byid:
        a = tuple(norm(byid[qid][f"Explanation_{c}"]) for c in "ABCD")
        b = tuple(norm(byid[partner][f"Explanation_{c}"]) for c in "ABCD")
        if a == b:
            bad.append((qid, partner))
assert not bad, f"still duplicated: {bad}"

# every corrected answer's explanation should be non-empty
empty = [qid for qid in CORR if not byid[qid][f"Explanation_{byid[qid]['Answer'].strip()}"].strip()]
assert not empty, f"empty answer explanation: {empty}"

print("Validation passed: no corrected row duplicates its partner; all answer explanations present.")
