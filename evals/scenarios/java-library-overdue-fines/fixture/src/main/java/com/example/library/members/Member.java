package com.example.library.members;

/** A person who borrows books. */
public record Member(String id, String name, Tier tier) {}
