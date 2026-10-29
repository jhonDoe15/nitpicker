from collections.abc import Sequence

from ..domain.book import Book


class InMemoryCatalog:
    def __init__(self, books: Sequence[Book]) -> None:
        self._books = tuple(books)

    def find(self, book_id: str) -> Book | None:
        return next((book for book in self._books if book.id == book_id), None)

    def all(self) -> tuple[Book, ...]:
        return self._books
