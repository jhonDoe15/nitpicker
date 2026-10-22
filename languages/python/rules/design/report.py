import json
import os
import traceback

from design.facts import DESIGN_REPORT, build_facts


def failure_text(error):
    frame = traceback.extract_tb(error.__traceback__)[-1]
    place = f"{os.path.basename(frame.filename)}:{frame.lineno}"
    return f"{type(error).__name__}: {error} ({place})"


def write_design(project, options, directory):
    try:
        payload = {"facts": build_facts(project, options)}
    except Exception as error:
        payload = {"error": failure_text(error)}
    with open(os.path.join(directory, DESIGN_REPORT), "w", encoding="utf-8") as handle:
        json.dump(payload, handle)
