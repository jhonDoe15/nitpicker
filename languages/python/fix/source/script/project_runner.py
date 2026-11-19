import ast

from fixers.comments.unused_ignore import unused_ignore
from fixers.project.alias import alias_fix
from fixers.project.forwarding import forwarding
from fixers.project.scan import module_functions
from fixers.project.unused_option import unused_option
from runner import Finding, node_at, parse, to_edit
from source_text import Decline, Source, refuse

RULES_TOOL = "python-rules"
FORWARDING = "forwarding-wrapper"
UNUSED_OPTION = "unused-option"
UNUSED_IGNORE = "unused-ignore"
SHIM = "compatibility-shim"
NOT_ALIAS = "only an alias assignment is replaced by its target"
FAILED = "the fixer failed on this finding"


def forwarding_fix(index, sources, editable, item):
    context = index.project.contexts[item["path"]]
    found = [
        node
        for node in module_functions(context.tree, item["subject"])
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]
    if len(found) != 1:
        refuse("the module defines the name more than once")
    return forwarding(index, sources, editable, item["path"], found[0])


def shim_fix(index, sources, editable, item):
    path = item["path"]
    statements = [
        node for node in node_at(sources[path], item["at"]) if isinstance(node, ast.Assign)
    ]
    if not statements:
        refuse(NOT_ALIAS)
    return alias_fix(index, sources, editable, path, statements[0])


def option_fix(index, sources, editable, item):
    path = item["path"]
    context = index.project.contexts[path]
    edit = unused_option(index, sources[path], context, item)
    return {path: edit}


def project_fixes(index, sources, editable, found):
    fixes, declines = [], []
    for item in found:
        finding = Finding(RULES_TOOL, item["rule"], item["path"], item["line"])
        try:
            if item["rule"] == FORWARDING:
                grouped = forwarding_fix(index, sources, editable, item)
            elif item["rule"] == SHIM:
                grouped = shim_fix(index, sources, editable, item)
            else:
                grouped = option_fix(index, sources, editable, item)
            if not set(grouped) <= editable:
                refuse("the file is not one --fix covers")
            edits = [
                edit if isinstance(edit, dict) else to_edit(sources[path], path, edit)
                for path, parts in grouped.items()
                for edit in parts
            ]
            fixes.append({"finding": finding.as_dict(), "edits": edits})
        except Decline as error:
            declines.append({**finding.as_dict(), "reason": str(error)})
        except Exception:
            declines.append({**finding.as_dict(), "reason": FAILED})
    return fixes, declines


def check_findings(project):
    from signatures import shims

    return [item for context in project.contexts.values() for item in shims.check(context)]


def main(payload):
    from review.project.forwarding import forwarding_findings
    from review.project.index import ProjectIndex
    from review.project.unused_options import unused_option_findings

    options = {**payload.get("options", {}), "published": True}
    files = payload["files"]
    editable = {item["path"] for item in files if item.get("editable")}
    targets, rules = set(payload["targets"]), set(payload["rules"])
    project, sources = parse(files, options, [])
    index = ProjectIndex(project)
    index.extra_texts = payload.get("texts", [])
    found = []
    try:
        if SHIM in rules:
            found.extend(check_findings(project))
        if FORWARDING in rules:
            found.extend(forwarding_findings(index))
        if UNUSED_OPTION in rules:
            found.extend(unused_option_findings(index, options))
    except RecursionError:
        return {"fixes": [], "declines": []}
    chosen = [item for item in found if item["path"] in targets]
    fixes, declines = project_fixes(index, sources, editable, chosen)
    return {"fixes": fixes, "declines": declines}


def ignore_main(payload):
    sources = {}
    for item in payload["files"]:
        try:
            sources[item["path"]] = Source(item["text"])
        except (SyntaxError, ValueError, UnicodeError, RecursionError):
            continue
    fixes, declines = [], []
    for item in payload["ignores"]:
        finding = Finding("mypy", UNUSED_IGNORE, item["path"], item["line"]).as_dict()
        try:
            source = sources[item["path"]]
            edits = unused_ignore(source, item["line"], item["message"])
            fixes.append(
                {
                    "finding": finding,
                    "edits": [to_edit(source, item["path"], edit) for edit in edits],
                }
            )
        except Decline as error:
            declines.append({**finding, "reason": str(error)})
        except Exception:
            declines.append({**finding, "reason": FAILED})
    return {"fixes": fixes, "declines": declines}
