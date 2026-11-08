package com.example.library.catalog

import com.example.library.catalog.adapters.InMemoryCatalog
import com.example.library.catalog.domain.rateCents

interface Catalog {
    fun find(id: String): Book?

    fun all(): List<Book>
}

fun inMemoryCatalog(books: List<Book>): Catalog = InMemoryCatalog(books)

fun dailyFineRateCents(book: Book): Int = rateCents(book.category)

fun describeBook(book: Book): String {
    val category = book.category.name.lowercase()
    return "${book.id} ${book.title} ($category, ${dailyFineRateCents(book)}c/day)"
}
