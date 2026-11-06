package demo.orders

class Rack {
    val counts = HashMap<String, Int>()
}

class Batches {
    private val counts = HashMap<String, Int>()
    private val rack = Rack()

    inner class Batch {
        private val counts = HashMap<String, Int>()

        fun outerMap(key: String): Int = this@Batches.counts.computeIfAbsent(key) { counts.remove(it) ?: 0 }

        fun outerThroughLabel(key: String): Int =
            this@Batches.counts.computeIfAbsent(key) { this@Batches.counts.remove(it) ?: 0 }
    }

    inner class Reader {
        fun outer(key: String): Int = counts.computeIfAbsent(key) { counts.remove(it) ?: 0 }
    }

    fun withRack(key: String): Int = counts.computeIfAbsent(key) {
        with(rack) { counts.remove(it) }
        1
    }

    fun applyRack(key: String): Int = counts.computeIfAbsent(key) {
        rack.apply { counts.clear() }
        1
    }
}
