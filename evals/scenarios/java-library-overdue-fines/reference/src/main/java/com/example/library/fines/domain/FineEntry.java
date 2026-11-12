package com.example.library.fines.domain;

/** The fine of one loan, and who owes it. */
public record FineEntry(String memberId, String name, long cents) {}
