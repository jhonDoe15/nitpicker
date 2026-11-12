package com.example.library.members

import com.example.library.members.adapters.InMemoryMembers

interface Directory {
    fun find(id: String): Member?

    fun all(): List<Member>
}

fun inMemoryMembers(members: List<Member>): Directory = InMemoryMembers(members)

fun isStudent(member: Member): Boolean = member.tier == Tier.STUDENT

fun describeMember(member: Member): String = "${member.name} (${member.tier.name.lowercase()})"
