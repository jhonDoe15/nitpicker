import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main(arguments):
    from design.report import write_design
    from nitpicker_rules import build_project, read_options

    list_file, out_file = arguments[:2]
    options = read_options(arguments)
    with open(list_file, encoding="utf-8") as handle:
        paths = [line.strip() for line in handle if line.strip()]
    write_design(build_project(paths, options), options, os.path.dirname(out_file))


if __name__ == "__main__":
    main(sys.argv[1:])
