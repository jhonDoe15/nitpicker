package com.example.library.catalog;

import java.util.List;
import java.util.Optional;

/** The books of the library, in the order they were added. */
public final class Catalog {
  private final List<Book> books;

  public Catalog(List<Book> books) {
    this.books = List.copyOf(books);
  }

  public Optional<Book> find(String id) {
    return books.stream().filter(book -> book.id().equals(id)).findFirst();
  }

  public List<Book> all() {
    return books;
  }
}
