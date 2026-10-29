package com.example.library.loans.domain

import java.time.LocalDate
import java.time.temporal.ChronoUnit

internal fun lateDays(
    dueOn: LocalDate,
    endOn: LocalDate,
): Int = maxOf(0L, ChronoUnit.DAYS.between(dueOn, endOn)).toInt()
