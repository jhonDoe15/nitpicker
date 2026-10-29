import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def main(arguments):
    from design.report import write_design
    from nitpicker_rules import build_project, read_options

    list_file, out_file = arguments[:2]
    options = read_options(arguments)
    lines = Path(list_file).read_text(encoding="utf-8").splitlines()
    paths = [line.strip() for line in lines if line.strip()]
    write_design(build_project(paths, options), options, Path(out_file).parent)


if __name__ == "__main__":
    main(sys.argv[1:])
