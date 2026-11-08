package com.example.library.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class CatalogTest {
  private static Book book(Category category) {
    return new Book("B1", "Dune", category);
  }

  @Test
  void pricesEveryCategoryInWholeCents() {
    assertEquals(25, book(Category.NOVEL).dailyFineRateCents());
    assertEquals(100, book(Category.REFERENCE).dailyFineRateCents());
    assertEquals(10, book(Category.CHILDREN).dailyFineRateCents());
    assertEquals(50, book(Category.PERIODICAL).dailyFineRateCents());
  }

  @Test
  void describesBookWithItsRate() {
    assertEquals("B1 Dune (novel, 25c/day)", book(Category.NOVEL).describe());
  }

  @Test
  void findsBooksById() {
    Catalog catalog = new Catalog(List.of(book(Category.NOVEL)));

    assertEquals(Optional.of(book(Category.NOVEL)), catalog.find("B1"));
    assertEquals(Optional.empty(), catalog.find("B2"));
    assertEquals(List.of(book(Category.NOVEL)), catalog.all());
  }
}
