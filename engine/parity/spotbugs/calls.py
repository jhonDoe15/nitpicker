"""calls.py <classes dir> <engine calls.tsv> [samples]

Compares the class call graph the visiting order is built from: the calls javap shows in the class files
against the ones the engine wrote with NP_SB_CALLS=<engine calls.tsv>. An edge is a class calling a method or
constructor, taking or returning an object, of another class of the folder that is not an interface.
"""
import os
import random
import re
import subprocess
import sys

HEAD = re.compile(
    r"^(?:public |private |protected |abstract |final |static |strictfp |sealed |non-sealed )*"
    r"(class|interface|enum|@interface) ([\w.$]+)"
)
CALL = re.compile(
    r"invoke(?:virtual|special|static|interface)\s+#\d+(?:,\s*\d+)?\s*// (?:Interface)?Method "
    r'(?:"?([\w/$\[;]+)"?\.)?"?[\w$<>]+"?:(\(\S*\))(\S+)'
)


def class_files(folder):
    return [os.path.join(root, name) for root, _, names in os.walk(folder) for name in names if name.endswith(".class")]


def from_classes(folder):
    files = class_files(folder)
    env = {key: value for key, value in os.environ.items() if key not in ("JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS")}
    calls, interfaces, current = {}, set(), None
    for start in range(0, len(files), 200):
        batch = files[start : start + 200]
        text = subprocess.run(["javap", "-c", "-p"] + batch, capture_output=True, text=True, env=env).stdout
        for line in text.split("\n"):
            head = HEAD.match(line)
            if head:
                current = head.group(2).split("<")[0].replace(".", "/")
                calls[current] = set()
                if head.group(1) in ("interface", "@interface"):
                    interfaces.add(current)
                continue
            call = CALL.search(line)
            if call and current:
                carries = "L" in call.group(2) or "[" in call.group(2) or call.group(3)[0] in "L["
                if carries:
                    calls[current].add(call.group(1) or current)
    return {
        (by, owner)
        for by, owners in calls.items()
        for owner in owners
        if owner != by and owner in calls and owner not in interfaces
    }, set(calls)


def from_engine(path, classes):
    dotted = {name.replace("/", ".").replace("$", "."): name for name in classes}
    edges, unknown = set(), 0
    for line in open(path):
        by, owner = line.rstrip("\n").split("\t")
        if by in dotted and owner in dotted:
            edges.add((dotted[by], dotted[owner]))
        else:
            unknown += 1
    return edges, unknown


def main():
    compiled, classes = from_classes(sys.argv[1])
    engine, unknown = from_engine(sys.argv[2], classes)
    samples = int(sys.argv[3]) if len(sys.argv) > 3 else 8
    print("same", len(engine & compiled), "only class files", len(compiled - engine), end=" ")
    print("only engine", len(engine - compiled), "unknown classes", unknown)
    random.seed(1)
    for tag, edges in (("only class files", compiled - engine), ("only engine", engine - compiled)):
        for by, owner in random.sample(sorted(edges), min(samples, len(edges))):
            print(" ", tag, by.split("/")[-1], "->", owner.split("/")[-1])


main()
