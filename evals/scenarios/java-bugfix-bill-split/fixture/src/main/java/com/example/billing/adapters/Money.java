package com.example.billing.adapters;

import java.util.Locale;

/** Formats whole cents as dollars. */
final class Money {
  private static final int CENTS_PER_DOLLAR = 100;

  private Money() {}

  static String format(long cents) {
    long dollars = cents / CENTS_PER_DOLLAR;
    long rest = cents % CENTS_PER_DOLLAR;
    return String.format(Locale.ROOT, "$%d.%02d", dollars, rest);
  }
}
