import sys

from report import report


def main() -> None:
    report(3, sys.stdout)


if __name__ == "__main__":
    main()
