from collections.abc import Sequence

from .composition_root import (
    catalog_main,
    loans_main,
    member_loans_main,
    overdue_report_main,
)


def run(argv: Sequence[str]) -> None:
    command, *arguments = argv
    match command:
        case "catalog":
            catalog_main()
        case "loans":
            loans_main(arguments[0])
        case "member":
            member_loans_main(arguments[0], arguments[1])
        case "overdue":
            overdue_report_main(arguments[0])
        case _:
            raise ValueError(f"Unknown command {command}")
