export const KOTLIN_ALIASES = `package demo
class Owner {
    fun target(value: Int): Int = value + 1
    fun alias(value: Int): Int = this.target(value)
    fun implicit(value: Int) = target(value)
    @Deprecated("compatibility") fun compatibility(value: Int): Int = target(value)
    fun changed(value: Int): Int = target(value + 1)
    fun adapted(value: Int): Long = target(value).toLong()
    fun defaulted(value: Int = 1): Int = target(value)
    context(token: String) fun contextual(value: Int): Int = target(value)
    fun from(value: Int): Int = target(value)
}
object Singleton {
    fun target(value: Int): Int = value + 1
    fun alias(value: Int): Int = this.target(value)
}
interface Contract { fun alias(value: Int): Int }
class Derived : Contract {
    fun target(value: Int): Int = value + 1
    override fun alias(value: Int): Int = target(value)
}
`;
