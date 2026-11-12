package com.example.library.catalog.adapters

import com.example.library.catalog.Book
import com.example.library.catalog.Catalog

internal class InMemoryCatalog(
    private val books: List<Book>,
) : Catalog {
    override fun find(id: String): Book? = books.find { it.id == id }

    override fun all(): List<Book> = books
}
