from dataclasses import dataclass
from enum import StrEnum


class Category(StrEnum):
    NOVEL = "novel"
    REFERENCE = "reference"
    CHILDREN = "children"
    PERIODICAL = "periodical"


DAILY_RATE_CENTS = {
    Category.NOVEL: 25,
    Category.REFERENCE: 100,
    Category.CHILDREN: 10,
    Category.PERIODICAL: 50,
}


@dataclass(frozen=True)
class Book:
    id: str
    title: str
    category: Category


def daily_fine_rate_cents(book: Book) -> int:
    return DAILY_RATE_CENTS[book.category]


def describe_book(book: Book) -> str:
    return (
        f"{book.id} {book.title} ({book.category}, {daily_fine_rate_cents(book)}c/day)"
    )
