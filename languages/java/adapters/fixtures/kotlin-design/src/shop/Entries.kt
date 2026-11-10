package shop

annotation class Route

interface Handler {
    fun handle(x: Int): Int
}

class Impl : Handler {
    override fun handle(x: Int): Int = x

    fun plain(): Int = 1
}

class Framework : Runnable {
    override fun run() {}

    fun helper() {}
}

class Controller {
    @Route
    fun index() {}

    fun plain() {}
}

class Failure : RuntimeException() {
    override fun toString(): String = "failure"

    fun detail(): String = "d"
}

fun main() {
    Impl().handle(1)
}

@Composable
fun Screen() {}

fun callHandler(handler: Handler): Int = handler.handle(1)
