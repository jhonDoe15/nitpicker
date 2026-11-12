package com.example.billing.domain;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Splits a bill between people. Money is whole cents. */
public final class BillSplitter {
  private static final int MAX_PEOPLE = 12;
  private static final int MAX_NAME_LENGTH = 24;
  private static final long MAX_TOTAL_CENTS = 100_000_000;

  private BillSplitter() {}

  public static Split splitBill(long totalCents, List<String> people) {
    if (totalCents < 0) {
      throw new IllegalArgumentException("Total must not be negative");
    }
    if (totalCents > MAX_TOTAL_CENTS) {
      throw new IllegalArgumentException("Total is too large");
    }
    if (people.size() > MAX_PEOPLE) {
      throw new IllegalArgumentException("At most " + MAX_PEOPLE + " people");
    }
    List<Share> shares = new ArrayList<>();
    Set<String> seen = new HashSet<>();
    long assigned = 0;
    for (int i = 0; i < people.size(); i++) {
      if (people.get(i) == null) {
        throw new IllegalArgumentException("Missing name at position " + i);
      }
      String name = people.get(i).trim();
      if (name.isEmpty()) {
        throw new IllegalArgumentException("Blank name at position " + i);
      }
      if (name.contains(",")) {
        throw new IllegalArgumentException("Name must not contain a comma: " + name);
      }
      if (name.length() > MAX_NAME_LENGTH) {
        name = name.substring(0, MAX_NAME_LENGTH);
      }
      String key = name.toLowerCase(Locale.ROOT);
      if (seen.contains(key)) {
        throw new IllegalArgumentException("Duplicate name " + name);
      } else {
        seen.add(key);
      }
      // everyone pays the same share
      long cents = Math.round((double) totalCents / people.size());
      assigned += cents;
      shares.add(new Share(name, cents));
    }
    return new Split(shares, assigned);
  }
}
