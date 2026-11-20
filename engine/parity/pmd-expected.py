"""pmd-expected.py <rules.json> <source dir> <out.json> [aux class path file]

Runs PMD with the XPath rules of a rule list and writes what it reports as a sorted list of
[file, rule, line, column]. A rule whose query fails on a file is listed as "!<rule>" at 0:0, and a file PMD cannot read as "!parse".
A row PMD reports twice is listed twice.
PMD_CLASSPATH holds the class path of the PMD command line (PMD 7).
"""
import json, os, re, subprocess, sys, tempfile
from xml.sax.saxutils import escape, quoteattr

rules_path, source, out = sys.argv[1:4]
aux = sys.argv[4] if len(sys.argv) > 4 else None
rules = json.load(open(rules_path))
parts = ['<?xml version="1.0" encoding="UTF-8"?>',
         '<ruleset xmlns="http://pmd.sourceforge.net/ruleset/2.0.0" name="engine-parity"><description>parity</description>']
for rule in rules:
    parts.append(f'<rule name={quoteattr(rule["name"])} language="java" message={quoteattr(rule.get("message") or rule["name"])} '
                 'class="net.sourceforge.pmd.lang.rule.xpath.XPathRule"><priority>3</priority><properties>')
    for name, written in (rule.get("properties") or {}).items():
        parts.append(f'<property name={quoteattr(name)} type={quoteattr(written.get("type") or "String")} '
                     f'value={quoteattr(written["value"])} description={quoteattr(name)}/>')
    parts.append(f'<property name="xpath"><value>{escape(rule["xpath"])}</value></property></properties></rule>')
parts.append('</ruleset>')
with tempfile.TemporaryDirectory() as work:
    ruleset, report = os.path.join(work, "rules.xml"), os.path.join(work, "report.json")
    open(ruleset, "w").write("\n".join(parts))
    command = ["java", "-cp", os.environ["PMD_CLASSPATH"], "net.sourceforge.pmd.cli.PmdCli", "check", "--no-cache", "--no-progress",
               "--no-fail-on-violation", "--no-fail-on-error", "--format", "json", "--report-file", report,
               "--rulesets", ruleset, "--dir", source]
    if aux:
        command += ["--aux-classpath", "file:" + aux]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    found = json.load(open(report))
root = os.path.abspath(source)
rows = []
for file in found["files"]:
    for seen in file["violations"]:
        rows.append((os.path.relpath(file["filename"], root), seen["rule"], seen["beginline"], seen["begincolumn"]))
for trouble in found.get("processingErrors", []):
    rule = re.search(r"Rule=([^\]]+)\]", trouble.get("detail", ""))
    failed = "!" + rule.group(1) if rule else "!parse"
    rows.append((os.path.relpath(trouble["filename"], root), failed, 0, 0))
open(out, "w").write("[\n" + ",\n".join(json.dumps(row) for row in sorted(rows)) + "\n]\n")
print(len(rows), "rows")
