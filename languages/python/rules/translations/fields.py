import re
import string

ROOT = re.compile(r"^[^.\[]*")


def parsed_fields(text, depth=0):
    auto, indexes, names = 0, set(), set()
    try:
        parts = list(string.Formatter().parse(text))
    except ValueError:
        return None
    for _, field, spec, _ in parts:
        if field is None:
            continue
        root = ROOT.match(field).group(0)
        if root == "":
            auto += 1
        elif root.isdigit():
            indexes.add(int(root))
        else:
            names.add(root)
        nested = parsed_fields(spec, depth + 1) if spec and depth == 0 else None
        if nested is not None:
            auto, indexes, names = (
                auto + nested[0],
                indexes | nested[1],
                names | nested[2],
            )
    return auto, indexes, names


def positional_slots(auto, indexes):
    return set(range(auto)) | indexes
