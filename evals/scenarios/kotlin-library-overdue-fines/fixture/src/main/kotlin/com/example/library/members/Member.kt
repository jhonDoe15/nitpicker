package com.example.library.members

enum class Tier {
    STANDARD,
    STUDENT,
}

data class Member(
    val id: String,
    val name: String,
    val tier: Tier,
)
