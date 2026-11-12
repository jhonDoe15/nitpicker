package com.example.library.catalog;

/** A book the library lends. */
public record Book(String id, String title, Category category) {
  /** The fine for each day this book is late, in cents. */
  public long dailyFineRateCents() {
    return category.dailyFineRateCents();
  }

  public String describe() {
    return id + " " + title + " (" + category.label() + ", " + dailyFineRateCents() + "c/day)";
  }
}
