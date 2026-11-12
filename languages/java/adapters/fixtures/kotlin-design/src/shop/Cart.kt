package shop

class Cart {
    private val items = mutableListOf<Line>()
    private val counts = HashMap<String, Int>()
    private var current = mutableListOf<Line>()
    val tags = mutableListOf<String>()
    private val _view = ArrayList<Line>()
    val view: List<Line> get() = _view
    val copy: List<Line> get() = items.toList()
    val immutable: List<String> = listOf("a")

    fun lines(): MutableList<Line> = items

    fun linesAgain(): MutableList<Line> {
        return items
    }

    fun snapshot(): List<Line> = items.toMutableList()

    fun swapped(): MutableList<Line> {
        return current
    }

    fun add(line: Line) {
        items.add(line)
        counts[line.sku] = 1
        current = ArrayList()
    }

    fun total(): Int = items.sumOf { it.price }

    fun count(sku: String): Int = counts.getOrDefault(sku, 0)

    fun count(sku: String, fallback: Int): Int = counts.getOrDefault(sku, fallback)
}

class Line(val sku: String, val price: Int)
