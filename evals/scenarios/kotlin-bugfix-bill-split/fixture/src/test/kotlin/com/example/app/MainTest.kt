package com.example.app

import kotlin.test.Test
import kotlin.test.assertEquals

class MainTest {
    @Test
    fun wiresTheSplitToTheWriter() {
        val written = mutableListOf<String>()
        printSplit(600, listOf("Ann", "Ben")) { written.add(it) }
        assertEquals(listOf("Ann  $3.00\n", "Ben  $3.00\n", "Total: $6.00\n"), written)
    }
}
