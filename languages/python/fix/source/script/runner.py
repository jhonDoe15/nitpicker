import ast
import os

import nitpicker_rules
from fixers.call_fixes import (
    catch_log,
    http_timeout,
    shell_command,
    tls_verification,
    unsafe_load,
)
from fixers.declaration_fixes import falsy_default, frozen_dataclass
from fixers.file_fixes import collected_name, comment_removals, mutate_removal
from source_text import Decline, Source, refuse

RULES_TOOL = "python-rules"
NODE_FIXES = {
    "catch-log-without-exception": catch_log,
    "falsy-default": falsy_default,
    "frozen-dataclass": frozen_dataclass,
    "http-without-timeout": http_timeout,
    "shell-command": shell_command,
    "tls-verification-off": tls_verification,
    "unsafe-deserialization": unsafe_load,
}
UNCOLLECTED = "uncollected-tests"
MUTANT_IGNORED = "mutant-ignored"


class Finding:
    def __init__(self, tool, rule, path, line):
        self.tool, self.rule, self.path, self.line = tool, rule, path, line

    def as_dict(self):
        return {
            "tool": self.tool,
            "rule": self.rule,
            "path": self.path,
            "line": self.line,
        }


def read_only_trees(reads):
    trees = []
    for item in reads:
        try:
            trees.append(Source(item["text"]).tree)
        except (SyntaxError, ValueError, UnicodeError, RecursionError):
            continue
    return trees


def parse(files, options, reads):
    from index.project import Project

    paths = [item["path"] for item in files]
    project = Project(options, paths)
    sources = {}
    for item in files:
        try:
            source = Source(item["text"])
        except (SyntaxError, ValueError, UnicodeError, RecursionError):
            continue
        sources[item["path"]] = source
        project.add(
            nitpicker_rules.FileContext(item["path"], source.text, source.tree, project)
        )
    project.reads = read_only_trees(reads)
    return project, sources


def node_at(source, at):
    for node in ast.walk(source.tree):
        if (
            getattr(node, "lineno", None) is None
            or getattr(node, "end_lineno", None) is None
        ):
            continue
        if (
            node.lineno,
            node.col_offset,
            node.end_lineno,
            node.end_col_offset,
        ) == tuple(at):
            yield node


def to_edit(source, path, edit):
    start, end, text = edit
    return {
        "type": "replace",
        "path": path,
        "start": source.utf16(start),
        "end": source.utf16(end),
        "text": text,
    }


def node_fix(source, context, item, fixer):
    last = None
    for node in node_at(source, item["at"]):
        try:
            edits = fixer(source, node, context)
        except Decline as reason:
            last = reason
            continue
        except Exception:
            last = "the fixer failed on this finding"
            continue
        return [to_edit(source, item["path"], edit) for edit in edits], None
    return None, str(last or "no matching syntax node")


def file_fix(source, context, item):
    name = os.path.basename(item["path"])
    if item["subject"] not in {name, f"{name} (unittest)"}:
        refuse("the file is left out of collection for another reason")
    target = collected_name(item["path"], context.options)
    return [{"type": "move", "from": item["path"], "to": target}], None


def rule_fixes(project, sources, findings):
    fixes, declines = [], []
    for item in findings:
        source = sources[item["path"]]
        context = project.contexts[item["path"]]
        edits, reason = None, None
        try:
            if item["rule"] == UNCOLLECTED:
                edits, reason = file_fix(source, context, item)
            else:
                edits, reason = node_fix(
                    source, context, item, NODE_FIXES[item["rule"]]
                )
        except Decline as error:
            reason = str(error)
        except Exception:
            reason = "the fixer failed on this finding"
        finding = Finding(
            RULES_TOOL, item["rule"], item["path"], item["line"]
        ).as_dict()
        if edits is None:
            declines.append({**finding, "reason": reason})
        else:
            fixes.append({"finding": finding, "edits": edits})
    return fixes, declines


def wanted(item, rules):
    return item["rule"] in rules and (
        item["rule"] in NODE_FIXES or item["rule"] == UNCOLLECTED
    )


def mutation_fixes(sources, options):
    tests = set(options.get("testFiles", []))
    fixes = []
    for path, source in sources.items():
        if path in tests:
            continue
        for token, match in comment_removals(source):
            edit = mutate_removal(source, token, match)
            finding = Finding("mutmut", MUTANT_IGNORED, path, token.start[0]).as_dict()
            fixes.append({"finding": finding, "edits": [to_edit(source, path, edit)]})
    return fixes


def main(payload):
    files = [item for item in payload["files"] if item["path"].endswith(".py")]
    options = payload.get("options", {})
    rules = set(payload.get("rules", []))
    project, sources = parse(files, options, payload.get("reads", []))
    modules = nitpicker_rules.load_checks()
    found = []
    for context in project.contexts.values():
        checked, _ = nitpicker_rules.file_results(context, modules)
        found.extend(item for item in checked if wanted(item, rules) and "at" in item)
    fixes, declines = rule_fixes(project, sources, found)
    if MUTANT_IGNORED in rules:
        fixes.extend(mutation_fixes(sources, options))
    return {"fixes": fixes, "declines": declines}
