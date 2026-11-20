"""compare.py <engine report.json> <expected rows.json> <source dir> [rule]

Compares an engine report with the rows `pmd-expected.py` wrote for the same rules and source folder.
Prints how many findings are the same, missed and extra (a row reported twice counts twice), then each rule
that differs.
"""
import collections, json, os, sys

report, expected, source = sys.argv[1:4]
only = sys.argv[4] if len(sys.argv) > 4 else None
root = os.path.abspath(source)
found = collections.Counter()
for finding in json.load(open(report))["findings"]:
    failed = finding["rule"].startswith("!")
    file = os.path.relpath(os.path.abspath(finding["file"]), root)
    found[(file, finding["rule"], 0 if failed else finding["line"], 0 if failed else finding["column"])] += 1
wanted = collections.Counter(tuple(row) for row in json.load(open(expected)))
missed, extra = wanted - found, found - wanted
print(f"same {sum((wanted & found).values())} missed {sum(missed.values())} extra {sum(extra.values())}")
rules = collections.Counter(row[1] for row in (missed + extra).elements())
for rule, count in sorted(rules.items()):
    print(f"  {rule}: {count}")
for label, rows in (("MISSED", missed), ("EXTRA", extra)):
    for row in sorted(rows):
        if only == row[1]:
            print(label, *row)
