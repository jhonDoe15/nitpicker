package shop

class Registry {
    private val names = mutableListOf<String>()

    fun names(): MutableList<String> = names

    fun size(): Int = names.size

    companion object {
        fun create(): Registry = Registry()
    }
}

class Clock : Comparable<Clock> {
    override fun compareTo(other: Clock): Int = 0
}

fun addName(registry: Registry) {
    registry.names() += "x"
}

fun build(): Int = Registry.create().size()
