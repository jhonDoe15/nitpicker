package com.example.billing

// Splits a bill between people. Money is integer cents.
data class Share(
    val name: String,
    val cents: Long,
)

enum class SplitFailure {
    NO_PEOPLE,
}

data class Split(
    val shares: List<Share>,
    val totalCents: Long,
    val failure: SplitFailure? = null,
)

private const val MAX_PEOPLE = 12
private const val MAX_NAME_LENGTH = 24
private const val MAX_TOTAL_CENTS = 100000000L

fun splitBill(
    totalCents: Long,
    people: List<String>,
): Split {
    if (totalCents < 0) {
        throw IllegalArgumentException("Total must not be negative")
    }
    if (totalCents > MAX_TOTAL_CENTS) {
        throw IllegalArgumentException("Total is too large")
    }
    if (people.size > MAX_PEOPLE) {
        throw IllegalArgumentException("At most " + MAX_PEOPLE + " people")
    }
    val shares = ArrayList<Share>()
    val seen = HashSet<String>()
    for (i in 0 until people.size) {
        var name = people[i].trim()
        if (name == "") {
            throw IllegalArgumentException("Blank name at position " + i)
        }
        if (name.contains(",")) {
            throw IllegalArgumentException("Name must not contain a comma: " + name)
        }
        // runs of spaces inside a name count as one space
        val collapsed = StringBuilder()
        var previousWasSpace = false
        for (ch in name) {
            if (ch == ' ') {
                if (!previousWasSpace) {
                    collapsed.append(ch)
                }
                previousWasSpace = true
            } else {
                collapsed.append(ch)
                previousWasSpace = false
            }
        }
        name = collapsed.toString()
        if (name.length > MAX_NAME_LENGTH) {
            name = name.substring(0, MAX_NAME_LENGTH)
        }
        val key = name.lowercase()
        if (seen.contains(key)) {
            throw IllegalArgumentException("Duplicate name " + name)
        } else {
            seen.add(key)
        }
        // everyone pays the same share, the left over cents go to the first people
        shares.add(Share(name, shareCents(totalCents, people.size, i)))
    }
    return splitOf(shares, totalCents)
}
