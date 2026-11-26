"""pmd-coded-expected.py <rules.json> <source dir> <out.json> [aux class path]

Runs PMD with the rules of a rule list that name the PMD class of a rule written in Java (`port`), with the same
properties, message and violationSuppressXPath, and writes what PMD reports as a sorted list of
[file, rule, line, column, message]. Classes for the aux class path come from compiling the sources a fixture keeps
as stubs. PMD_CLASSPATH holds the class path of the PMD command line (PMD 7).
"""
import json, os, subprocess, sys, tempfile
from xml.sax.saxutils import escape, quoteattr

rules_path, source, out = sys.argv[1:4]
aux = sys.argv[4] if len(sys.argv) > 4 else None
parts = ['<?xml version="1.0" encoding="UTF-8"?>',
         '<ruleset xmlns="http://pmd.sourceforge.net/ruleset/2.0.0" name="engine-parity"><description>parity</description>']
for rule in json.load(open(rules_path)):
    if not rule.get("port"):
        continue
    category = "bestpractices" if rule["port"].endswith(".UnnecessaryPmdSuppressionRule") else rule["port"].split(".")[-2]
    parts.append(f'<rule ref="category/java/{category}.xml/{rule["name"]}" message={quoteattr(rule["message"])}><properties>')
    for name, written in (rule.get("properties") or {}).items():
        parts.append(f'<property name={quoteattr(name)} value={quoteattr(written["value"])}/>')
    if rule.get("suppress"):
        parts.append(f'<property name="violationSuppressXPath"><value>{escape(rule["suppress"])}</value></property>')
    parts.append('</properties></rule>')
parts.append('</ruleset>')
with tempfile.TemporaryDirectory() as work:
    ruleset, report = os.path.join(work, "rules.xml"), os.path.join(work, "report.json")
    open(ruleset, "w").write("\n".join(parts))
    command = ["java", "-cp", os.environ["PMD_CLASSPATH"], "net.sourceforge.pmd.cli.PmdCli", "check", "--no-cache", "--no-progress",
               "--no-fail-on-violation", "--no-fail-on-error", "--format", "json", "--report-file", report,
               "--rulesets", ruleset, "--dir", source]
    if aux:
        command += ["--aux-classpath", aux]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    found = json.load(open(report))
root = os.path.abspath(source)
rows = [(os.path.relpath(file["filename"], root), seen["rule"], seen["beginline"], seen["begincolumn"], seen["description"])
        for file in found["files"] for seen in file["violations"]]
rows += [(os.path.relpath(trouble["filename"], root), "!error", 0, 0, "") for trouble in found.get("processingErrors", [])]
open(out, "w").write("[\n" + ",\n".join(json.dumps(row) for row in sorted(rows)) + "\n]\n")
print(len(rows), "rows")
