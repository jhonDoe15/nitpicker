"""Reads the settings files of the importer.

One "key = value" per line; a line that starts with "#" is a comment. A value is a
comma separated list. "key+ = value" appends to the list the key already has.
"""

import re
from typing import Any

Settings = dict[str, list[str]]


def parse_settings(text: str) -> Settings:
    result: Any = {}
    lines = text.split("\n")
    for i in range(len(lines)):
        line = lines[i].strip()
        if line == "" or line[0] == "#":
            continue
        eq = line.find("=")
        if eq < 0:
            raise ValueError("Line " + str(i + 1) + ": expected key=value")
        key = line[:eq].strip()
        append = False
        if key[-1:] == "+":
            append = True
            key = key[:-1].strip()
        if key == "":
            raise ValueError("Line " + str(i + 1) + ": missing key")
        for k in range(len(key)):
            c = key[k]
            if not re.match(r"[A-Za-z0-9_.-]", c):
                raise ValueError("Line " + str(i + 1) + ": invalid key " + key)
        raw = line[eq + 1 :].strip()
        values = []
        if raw != "":
            parts = raw.split(",")
            for j in range(len(parts)):
                values.append(parts[j].strip())
        if append and key in result:
            for j in range(len(values)):
                result[key].append(values[j])
        else:
            result[key] = values
    return result
