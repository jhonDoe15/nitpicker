package shop

import java.util.ArrayList as Items

class Stores(val given: MutableList<String> = mutableListOf(), val plain: List<String> = listOf()) {
    private var reused = mutableListOf<String>()
    private var swapped = mutableListOf<String>()
    private var mixed = mutableListOf<String>()
    private val built = mutableListOf<String>().apply { add("a") }
    private val copied = listOf("a").toMutableList()
    private val aliased = Items<String>()
    private val picked = mutableListOf<String>()
    val lazily by lazy { mutableListOf<String>() }

    fun swap() {
        swapped = ArrayList()
        mixed = listOf()
    }

    fun reuse(): MutableList<String> = reused

    fun swappedList(): MutableList<String> = swapped

    fun mixedList(): MutableList<String> = mixed

    fun builtList(): MutableList<String> = built

    fun copiedList(): MutableList<String> = copied

    fun aliasedList(): MutableList<String> = aliased

    fun pick(flag: Boolean): MutableList<String> = if (flag) picked else mutableListOf()

    fun byWhen(n: Int): MutableList<String> = when (n) {
        0 -> picked
        else -> ArrayList()
    }

    fun locked(): MutableList<String> = synchronized(this) { picked }
}

class Buf {
    private val text = StringBuilder()

    fun text(): StringBuilder = text
}
