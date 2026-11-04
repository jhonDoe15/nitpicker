package shop

open class Base {
    protected fun hook() {}

    internal fun inner() {}

    protected val shared = mutableListOf<String>()

    internal val inside = mutableListOf<String>()

    fun visible() {}
}

abstract class Shape {
    abstract val sides: Int

    abstract var label: String
}

interface Named {
    val title: String
}
