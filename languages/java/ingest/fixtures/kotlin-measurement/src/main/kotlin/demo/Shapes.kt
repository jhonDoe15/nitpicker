package demo

sealed class Shape {
    data class Circle(val radius: Double) : Shape()
    data class Square(val side: Double) : Shape()
    data object Empty : Shape()
}

enum class Color { RED, GREEN, BLUE }

fun area(shape: Shape): Double =
    when (shape) {
        is Shape.Circle -> 3.0 * shape.radius * shape.radius
        is Shape.Square -> shape.side * shape.side
        Shape.Empty -> 0.0
    }

fun hex(color: Color): String =
    when (color) {
        Color.RED -> "f00"
        Color.GREEN -> "0f0"
        Color.BLUE -> "00f"
    }

fun describe(code: Int): String =
    when (code) {
        1 -> "one"
        2 -> "two"
        else -> "many"
    }

fun word(text: String): Int =
    when (text) {
        "a" -> 1
        "b" -> 2
        else -> 0
    }
