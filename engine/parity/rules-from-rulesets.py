"""rules-from-rulesets.py <rulesets dir> <pmd-java jar> <out.json>

Writes the rule list the engine runs: every XPath rule the Java rulesets define, and every PMD rule they
enable that PMD itself ships as an XPath rule, with the properties the rulesets set. PMD rules written in
Java are left out and listed on standard error. Each entry has name, file, xpath, message, suppress (the
rule's violationSuppressXPath) and the other properties.
"""
import collections, json, sys, zipfile
import xml.etree.ElementTree as ET

NS = "{http://pmd.sourceforge.net/ruleset/2.0.0}"
RULESETS = ["pmd-ruleset.xml", "pmd-main-ruleset.xml", "pmd-test-ruleset.xml", "reactor-ruleset.xml", "spring-ruleset.xml",
            "spring-test-ruleset.xml", "rules/guards-ruleset.xml", "rules/test-honesty-ruleset.xml"]
STANDARD = {"xpath", "violationSuppressXPath", "violationSuppressRegex"}


def properties(rule):
    found = collections.OrderedDict()
    for written in rule.iter(NS + "property"):
        value = written.get("value")
        if value is None:
            inner = written.find(NS + "value")
            value = inner.text if inner is not None else ""
        found[written.get("name")] = (written.get("type") or "", value)
    return found


def entry(name, file, message, found):
    return {"name": name, "file": file, "xpath": found["xpath"][1], "message": message or "",
            "suppress": found.get("violationSuppressXPath", ("", ""))[1],
            "properties": {key: {"type": kind, "value": value} for key, (kind, value) in found.items() if key not in STANDARD}}


def main(directory, jar, out):
    shipped = {}
    with zipfile.ZipFile(jar) as archive:
        for path in archive.namelist():
            if path.startswith("category/java/") and path.endswith(".xml"):
                for rule in ET.fromstring(archive.read(path)).iter(NS + "rule"):
                    if rule.get("name") and rule.get("class"):
                        shipped[path + "/" + rule.get("name")] = rule
    rules, enabled, overrides = [], collections.OrderedDict(), {}
    for name in RULESETS:
        for rule in ET.parse(f"{directory}/{name}").getroot().findall(NS + "rule"):
            reference = rule.get("ref")
            if not reference:
                rules.append(entry(rule.get("name"), name, rule.get("message"), properties(rule)))
            elif reference.endswith(".xml"):
                skipped = {excluded.get("name") for excluded in rule.findall(NS + "exclude")}
                for key in shipped:
                    if key.startswith(reference + "/") and key.rsplit("/", 1)[1] not in skipped:
                        enabled.setdefault(key, name)
            else:
                enabled.setdefault(reference, name)
                overrides.setdefault(reference, rule)
    coded = []
    for reference in enabled:
        base, override = shipped[reference], overrides.get(reference)
        if "XPathRule" not in base.get("class"):
            coded.append(base.get("name"))
            continue
        found = properties(base)
        for key, (kind, value) in (properties(override) if override is not None else {}).items():
            found[key] = (found.get(key, (kind, ""))[0] or kind, value)
        message = (override.get("message") if override is not None else None) or base.get("message")
        rules.append(entry(base.get("name"), reference.rsplit("/", 1)[0], message, found))
    with open(out, "w") as target:
        json.dump(rules, target, indent=1)
        target.write("\n")
    print(len(rules), "XPath rules;", len(coded), "PMD rules written in Java are not in the list:", ", ".join(sorted(coded)), file=sys.stderr)


main(*sys.argv[1:4])
