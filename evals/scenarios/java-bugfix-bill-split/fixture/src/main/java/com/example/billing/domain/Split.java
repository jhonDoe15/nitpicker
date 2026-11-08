package com.example.billing.domain;

import java.util.List;

/** A bill divided between people. Money is whole cents. */
public record Split(List<Share> shares, long totalCents) {
  public Split {
    shares = List.copyOf(shares);
  }
}
