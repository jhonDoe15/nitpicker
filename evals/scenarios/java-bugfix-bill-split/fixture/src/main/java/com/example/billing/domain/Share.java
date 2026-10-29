package com.example.billing.domain;

/** One person's part of a bill. Money is whole cents. */
public record Share(String name, long cents) {}
