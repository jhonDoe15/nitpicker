package com.example.billing.domain;

/** The outcome of splitting a bill: a split, or nobody to split between. */
public sealed interface SplitResult permits Split, NoPeople {
  long totalCents();
}
