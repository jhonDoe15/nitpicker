package com.example.library.catalog

enum class Category {
    NOVEL,
    REFERENCE,
    CHILDREN,
    PERIODICAL,
}

data class Book(
    val id: String,
    val title: String,
    val category: Category,
)
