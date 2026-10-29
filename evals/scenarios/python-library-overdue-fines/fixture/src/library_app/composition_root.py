import sys
from collections.abc import Sequence

from .features.catalog import Book, Category, InMemoryCatalog, describe_book
from .features.loans import InMemoryLoans, Loan, describe_loan
from .features.members import InMemoryMembers, Member, Tier

BOOKS = (
    Book("B1", "Dune", Category.NOVEL),
    Book("B2", "World Atlas", Category.REFERENCE),
    Book("B3", "The Gruffalo", Category.CHILDREN),
    Book("B4", "Nature Monthly", Category.PERIODICAL),
)

MEMBERS = (
    Member("M1", "Ada Stone", Tier.STANDARD),
    Member("M2", "Grace Mill", Tier.STUDENT),
    Member("M3", "Brian Cole", Tier.STANDARD),
    Member("M4", "Alan Fox", Tier.STANDARD),
    Member("M5", "Edgar Dunn", Tier.STUDENT),
    Member("M6", "Barbara Lane", Tier.STANDARD),
)

LOANS = (
    Loan("B1", "M1", "2026-03-10", "2026-03-24"),
    Loan("B3", "M1", "2026-03-14", "2026-03-28"),
    Loan("B2", "M2", "2026-02-24", "2026-03-10"),
    Loan("B1", "M2", "2026-03-12", "2026-03-26"),
    Loan("B1", "M3", "2026-02-20", "2026-03-06"),
    Loan("B4", "M4", "2026-03-07", "2026-03-21", "2026-03-23"),
    Loan("B1", "M4", "2026-03-01", "2026-03-15"),
    Loan("B3", "M5", "2026-03-16", "2026-03-30"),
    Loan("B1", "M5", "2026-03-17", "2026-03-31"),
    Loan("B2", "M5", "2026-03-06", "2026-03-20", "2026-03-20"),
    Loan("B2", "M6", "2026-03-06", "2026-03-20", "2026-04-05"),
    Loan("B3", "M6", "2026-03-24", "2026-04-07"),
    Loan("B99", "M1", "2026-02-15", "2026-03-01"),
    Loan("B1", "M99", "2026-02-16", "2026-03-02"),
)

catalog = InMemoryCatalog(BOOKS)
directory = InMemoryMembers(MEMBERS)
repository = InMemoryLoans(LOANS)


def write_lines(lines: Sequence[str]) -> None:
    for line in lines:
        sys.stdout.write(f"{line}\n")


def title_of(book_id: str) -> str:
    book = catalog.find(book_id)
    return book.title if book is not None else book_id


def catalog_main() -> None:
    write_lines([describe_book(book) for book in catalog.all()])


def loans_main(as_of: str) -> None:
    write_lines(
        [
            f"{loan.member_id}: {describe_loan(title_of(loan.book_id), loan, as_of)}"
            for loan in repository.all()
        ]
    )


def member_loans_main(member_id: str, as_of: str) -> None:
    member = directory.find(member_id)
    if member is None:
        write_lines([f"Unknown member {member_id}"])
        return
    lines = [
        describe_loan(title_of(loan.book_id), loan, as_of)
        for loan in repository.for_member(member_id)
    ]
    write_lines([f"Loans for {member.name}", *lines])
