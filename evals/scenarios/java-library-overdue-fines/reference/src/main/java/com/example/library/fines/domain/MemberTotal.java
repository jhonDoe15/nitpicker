package com.example.library.fines.domain;

import java.util.Comparator;
import java.util.Locale;

/** What one member owes in all. */
record MemberTotal(String name, long cents) {
  private static final int CENTS_PER_DOLLAR = 100;

  /** Largest total first, ties in name order. */
  static final Comparator<MemberTotal> RANKING =
      Comparator.comparingLong(MemberTotal::cents).reversed().thenComparing(MemberTotal::name);

  MemberTotal plus(MemberTotal other) {
    return new MemberTotal(name, cents + other.cents);
  }

  String line() {
    return String.format(
        Locale.ROOT, "%s: $%d.%02d", name, cents / CENTS_PER_DOLLAR, cents % CENTS_PER_DOLLAR);
  }
}
