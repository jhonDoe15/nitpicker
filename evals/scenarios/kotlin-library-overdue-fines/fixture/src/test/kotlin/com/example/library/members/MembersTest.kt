package com.example.library.members

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

private val ada = Member("M1", "Ada Stone", Tier.STANDARD)
private val grace = Member("M2", "Grace Mill", Tier.STUDENT)

class MembersTest {
    @Test
    fun recognisesStudents() {
        assertTrue(isStudent(grace))
        assertFalse(isStudent(ada))
    }

    @Test
    fun describesAMemberWithTheTier() {
        assertEquals("Grace Mill (student)", describeMember(grace))
    }

    @Test
    fun findsMembersById() {
        val directory = inMemoryMembers(listOf(ada, grace))
        assertEquals(grace, directory.find("M2"))
        assertNull(directory.find("M3"))
        assertEquals(listOf(ada, grace), directory.all())
    }
}
