package com.example.billing.domain;

/** A bill that could not be split because the list of people was empty. */
public record NoPeople(long totalCents) implements SplitResult {}
