package com.example.library.catalog

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

private fun book(category: Category): Book = Book("B1", "Dune", category)

class CatalogTest {
    @Test
    fun pricesEveryCategoryInWholeCents() {
        assertEquals(25, dailyFineRateCents(book(Category.NOVEL)))
        assertEquals(100, dailyFineRateCents(book(Category.REFERENCE)))
        assertEquals(10, dailyFineRateCents(book(Category.CHILDREN)))
        assertEquals(50, dailyFineRateCents(book(Category.PERIODICAL)))
    }

    @Test
    fun describesABookWithItsRate() {
        assertEquals("B1 Dune (novel, 25c/day)", describeBook(book(Category.NOVEL)))
    }

    @Test
    fun findsBooksById() {
        val catalog = inMemoryCatalog(listOf(book(Category.NOVEL)))
        assertEquals(book(Category.NOVEL), catalog.find("B1"))
        assertNull(catalog.find("B2"))
        assertEquals(listOf(book(Category.NOVEL)), catalog.all())
    }
}
