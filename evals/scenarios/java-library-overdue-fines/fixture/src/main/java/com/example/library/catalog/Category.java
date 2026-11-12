package com.example.library.catalog;

import java.util.Locale;

/** What kind of book it is; the kind sets the daily fine rate in cents. */
public enum Category {
  NOVEL(25),
  REFERENCE(100),
  CHILDREN(10),
  PERIODICAL(50);

  private final long dailyFineRateCents;

  Category(long dailyFineRateCents) {
    this.dailyFineRateCents = dailyFineRateCents;
  }

  public long dailyFineRateCents() {
    return dailyFineRateCents;
  }

  public String label() {
    return name().toLowerCase(Locale.ROOT);
  }
}
