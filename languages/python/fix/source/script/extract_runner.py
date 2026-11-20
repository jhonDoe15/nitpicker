import ast

from fixers.extract import partial, whole
from fixers.extract.units import function_of, unit_index
from source_text import Decline, Source, refuse

RULES_TOOL = "structure"
FAILED = "the fixer failed on this finding"
STRATEGIES = {"whole": whole, "partial": partial}


def parsed(files):
    sources = {}
    for item in files:
        try:
            sources[item["path"]] = Source(item["text"])
        except (SyntaxError, ValueError, UnicodeError, RecursionError):
            continue
    return sources


def units_main(payload):
    from near_duplicate_units import near_duplicate_units
    from python_facts import import_bindings

    units = []
    for path, source in parsed(payload["files"]).items():
        text = source.text[source.shift :]
        bindings = import_bindings(source.tree)
        for unit in near_duplicate_units(source.tree, text, bindings, path):
            units.append({**unit, "file": path})
    return {"units": units}


def request_of(candidate, source, claimed, project):
    index = unit_index(source.tree)
    found = [function_of(index, candidate[key]) for key in ("first", "second")]
    if None in found:
        refuse("a copy is not a plain function")
    return {
        "functions": [item[0] for item in found],
        "containers": [item[1] for item in found],
        "label": candidate["first"]["name"],
        "holes": candidate["holes"],
        "runs": candidate.get("runs"),
        "claimed": claimed,
        "project": project,
    }


def extract_main(payload):
    strategy = STRATEGIES[payload["strategy"]]
    sources = parsed(payload["files"])
    claimed = {}
    fixes, declines = [], []
    for candidate in payload["candidates"]:
        finding = candidate["reported"]
        path = candidate["first"]["file"]
        try:
            source = sources.get(path) or refuse("the file could not be parsed")
            names = claimed.setdefault(path, set())
            edits = strategy.extract(source, request_of(candidate, source, names, sources))
            fixes.append(
                {
                    "finding": finding,
                    "edits": [
                        {
                            "type": "replace",
                            "path": path,
                            "start": source.utf16(start),
                            "end": source.utf16(end),
                            "text": text,
                        }
                        for start, end, text in edits
                    ],
                }
            )
        except Decline as error:
            declines.append({**finding, "reason": str(error)})
        except Exception:
            declines.append({**finding, "reason": FAILED})
    return {"fixes": fixes, "declines": declines}
