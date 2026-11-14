import json
import sys
from importlib import metadata

LOWER_BOUNDS = {">=", ">", "~=", "=="}


def lowest_python(requires):
    try:
        from packaging.specifiers import SpecifierSet
        from packaging.version import Version

        bounds = [
            Version(spec.version.removesuffix(".*"))
            for spec in SpecifierSet(requires)
            if spec.operator in LOWER_BOUNDS
        ]
        return max(bounds) if bounds else None
    except Exception:
        return None


def admits(distribution_requires, minimum):
    try:
        from packaging.specifiers import SpecifierSet

        return SpecifierSet(distribution_requires).contains(minimum, prereleases=True)
    except Exception:
        return True


def version_of(name, minimum):
    try:
        found = metadata.metadata(name)
        version = found["Version"]
    except (metadata.PackageNotFoundError, KeyError):
        return None, False
    requires = found.get("Requires-Python")
    if requires and minimum is not None and not admits(requires, minimum):
        return None, True
    return version, True


def versions(names, requires_python=None):
    minimum = lowest_python(requires_python) if requires_python else None
    found = {}
    for name in names:
        version, installed = version_of(name, minimum)
        if installed:
            found[name] = version
    return found


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as handle:
        request = json.load(handle)
    json.dump(versions(request["names"], request.get("requiresPython")), sys.stdout)
