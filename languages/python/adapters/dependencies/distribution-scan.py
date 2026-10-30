import ast
import json
import re
import sys
import warnings

MINIMUM = (3, 10)
DOTTED = re.compile(r"^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$")
SCHEME_PART = re.compile(r"[A-Za-z_]\w*")
LONGEST_REFERENCE = 200
REQUIREMENT_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")


def references(root, files):
    found = set()
    for relative in files:
        try:
            with open(f"{root}/{relative}", "rb") as handle:
                tree = ast.parse(handle.read(), relative)
        except (SyntaxError, ValueError, RecursionError, OSError):
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Constant) or not isinstance(node.value, str):
                continue
            text = node.value.strip()
            if len(text) > LONGEST_REFERENCE:
                continue
            if DOTTED.match(text):
                found.add(text.split(".")[0])
            elif "://" in text:
                found.update(SCHEME_PART.findall(text.split("://")[0]))
    return sorted(found)


def optional_requirements(distributions):
    optional = {}
    for dist in distributions:
        names = [
            REQUIREMENT_NAME.match(requirement).group(0)
            for requirement in dist.requires or []
            if "extra ==" in requirement and REQUIREMENT_NAME.match(requirement)
        ]
        if names:
            optional[dist.metadata["Name"]] = sorted(set(names))
    return optional


def importable(tops):
    import importlib.util

    found = []
    for top in tops:
        try:
            if importlib.util.find_spec(top) is None:
                continue
        except Exception:
            pass
        found.append(top)
    return sorted(found)


def scan(request):
    version = list(sys.version_info[:2])
    if tuple(version) < MINIMUM:
        return {"python": version}
    import importlib.metadata as metadata

    distributions = list(metadata.distributions())
    with_entry_points = sorted(
        {dist.metadata["Name"] for dist in distributions if dist.entry_points}
    )
    return {
        "optional": optional_requirements(distributions),
        "python": version,
        "stdlib": sorted(sys.stdlib_module_names),
        "modules": metadata.packages_distributions(),
        "entryPoints": with_entry_points,
        "references": references(request["root"], request["files"]),
        "importable": importable(request.get("tops", [])),
    }


if __name__ == "__main__":
    warnings.simplefilter("ignore")
    with open(sys.argv[1], encoding="utf-8") as handle:
        json.dump(scan(json.load(handle)), sys.stdout)
