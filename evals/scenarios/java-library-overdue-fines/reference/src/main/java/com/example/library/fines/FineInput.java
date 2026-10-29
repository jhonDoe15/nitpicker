package com.example.library.fines;

import com.example.library.members.Tier;

/** What decides the fine for one loan. */
public record FineInput(long dailyRateCents, long daysLate, Tier tier) {}
