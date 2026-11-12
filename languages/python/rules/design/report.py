import json
import traceback
from pathlib import Path

from design.facts import DESIGN_REPORT, build_facts

PRODUCER_ERRORS = (
    ArithmeticError,
    AttributeError,
    LookupError,
    RecursionError,
    TypeError,
    ValueError,
)


def failure_text(error):
    frame = traceback.extract_tb(error.__traceback__)[-1]
    place = f"{Path(frame.filename).name}:{frame.lineno}"
    return f"{type(error).__name__}: {error} ({place})"


def write_design(project, options, directory):
    try:
        payload = {"facts": build_facts(project, options)}
    except PRODUCER_ERRORS as error:
        payload = {"error": failure_text(error)}
    with (Path(directory) / DESIGN_REPORT).open("w", encoding="utf-8") as handle:
        json.dump(payload, handle)
