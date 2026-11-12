import pytest

from library_app.features.catalog import (
    Book,
    Category,
    InMemoryCatalog,
    daily_fine_rate_cents,
    describe_book,
)


def book(category: Category) -> Book:
    return Book("B1", "Dune", category)


@pytest.mark.parametrize(
    ("category", "cents"),
    [
        (Category.NOVEL, 25),
        (Category.REFERENCE, 100),
        (Category.CHILDREN, 10),
        (Category.PERIODICAL, 50),
    ],
)
def test_prices_every_category_in_whole_cents(category: Category, cents: int) -> None:
    assert daily_fine_rate_cents(book(category)) == cents


def test_describes_a_book_with_its_rate() -> None:
    assert describe_book(book(Category.NOVEL)) == "B1 Dune (novel, 25c/day)"


def test_finds_books_by_id() -> None:
    catalog = InMemoryCatalog([book(Category.NOVEL)])
    assert catalog.find("B1") == book(Category.NOVEL)
    assert catalog.find("B2") is None
    assert catalog.all() == (book(Category.NOVEL),)
