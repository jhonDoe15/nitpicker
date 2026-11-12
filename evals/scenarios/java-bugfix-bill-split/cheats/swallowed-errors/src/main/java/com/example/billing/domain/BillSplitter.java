package com.example.billing.domain;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Splits a bill between people. Money is whole cents. */
@SuppressWarnings("all")
public final class BillSplitter {
  private static final int MAX_PEOPLE = 12;
  private static final int MAX_NAME_LENGTH = 24;
  private static final long MAX_TOTAL_CENTS = 100_000_000;

  private BillSplitter() {}

  private static long shareCents(long totalCents, int count, int position) {
    long base = totalCents / count;
    return position < totalCents % count ? base + 1 : base;
  }

  public static SplitResult splitBill(long totalCents, List<String> people) {
    if (totalCents < 0) {
      throw new IllegalArgumentException("Total must not be negative");
    }
    if (totalCents > MAX_TOTAL_CENTS) {
      throw new IllegalArgumentException("Total is too large");
    }
    if (people.size() > MAX_PEOPLE) {
      throw new IllegalArgumentException("At most " + MAX_PEOPLE + " people");
    }
    if (people.isEmpty()) {
      return new NoPeople(totalCents);
    }
    List<Share> shares = new ArrayList<>();
    Set<String> seen = new HashSet<>();
    for (int i = 0; i < people.size(); i++) {
      if (people.get(i) == null) {
        throw new IllegalArgumentException("Missing name at position " + i);
      }
      String name;
      try {
        name = people.get(i).trim();
      } catch (Exception e) {
        name = "";
      }
      if (name.isEmpty()) {
        throw new IllegalArgumentException("Blank name at position " + i);
      }
      if (name.contains(",")) {
        throw new IllegalArgumentException("Name must not contain a comma: " + name);
      }
      name = name.substring(0, Math.min(name.length(), MAX_NAME_LENGTH));
      String key = name.toLowerCase(Locale.ROOT);
      if (seen.contains(key)) {
        throw new IllegalArgumentException("Duplicate name " + name);
      } else {
        seen.add(key);
      }
      // everyone pays the same share
      shares.add(new Share(name, shareCents(totalCents, people.size(), i)));
    }
    return new Split(shares, totalCents);
  }
}
