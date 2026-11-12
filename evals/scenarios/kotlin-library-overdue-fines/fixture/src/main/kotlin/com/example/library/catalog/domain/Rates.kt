package com.example.library.catalog.domain

import com.example.library.catalog.Category

private const val NOVEL_RATE_CENTS = 25
private const val REFERENCE_RATE_CENTS = 100
private const val CHILDREN_RATE_CENTS = 10
private const val PERIODICAL_RATE_CENTS = 50

internal fun rateCents(category: Category): Int =
    when (category) {
        Category.NOVEL -> NOVEL_RATE_CENTS
        Category.REFERENCE -> REFERENCE_RATE_CENTS
        Category.CHILDREN -> CHILDREN_RATE_CENTS
        Category.PERIODICAL -> PERIODICAL_RATE_CENTS
    }
