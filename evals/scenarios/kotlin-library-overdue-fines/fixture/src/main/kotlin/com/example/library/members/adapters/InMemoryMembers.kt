package com.example.library.members.adapters

import com.example.library.members.Directory
import com.example.library.members.Member

internal class InMemoryMembers(
    private val members: List<Member>,
) : Directory {
    override fun find(id: String): Member? = members.find { it.id == id }

    override fun all(): List<Member> = members
}
