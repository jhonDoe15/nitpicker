export const FORWARDING = `package demo

fun target(value: Int): Int = value + 1
internal fun redundant(value: Int): Int = target(value)
private fun block(value: Int): Int { return target(value) }
fun facade(value: Int): Int = target(value)
@Deprecated("compatibility") internal fun decorated(value: Int): Int = target(value)
internal fun adapted(value: Int): Long = target(value).toLong()
internal fun renamed(other: Int): Int = target(other)
internal fun defaulted(value: Int = 1): Int = target(value)
internal fun named(value: Int): Int = target(value = value)
internal fun changed(value: Int): Int = target(value + 1)
internal fun inferred(value: Int) = target(value)
suspend fun suspendingTarget(value: Int): Int = value
internal suspend fun suspended(value: Int): Int = suspendingTarget(value)
private fun hiddenTarget(value: Int): Int = value
internal fun hides(value: Int): Int = hiddenTarget(value)
internal fun injected(target: (Int) -> Int, value: Int): Int = target(value)
fun overloaded(value: Int): Int = value
fun overloaded(value: Long): Long = value
internal fun overload(value: Int): Int = overloaded(value)
internal fun duplicate(value: Int): Int = target(value)
internal fun duplicate(value: Long): Long = value
internal fun Int.extension(): Int = target(this)
internal fun generic(value: Int): Int = identity<Int>(value)
fun <T> identity(value: T): T = value
class Owner { internal fun member(value: Int): Int = target(value) }
fun pair(first: Int, second: Int): Int = first + second
internal fun swapped(first: Int, second: Int): Int = pair(second, first)
fun withDefault(value: Int = 0): Int = value
internal fun targetDefault(value: Int): Int = withDefault(value)
fun varargs(vararg value: Int): Int = value.size
internal fun spreads(vararg value: Int): Int = varargs(*value)
fun unitTarget(): Unit = Unit
internal fun unitForward(): Unit = unitTarget()
internal fun discards(): Unit { unitTarget() }
`;

export const IMPORTED_FORWARDING = `package demo
import other.target as alias
internal fun unknown(value: Int): Int = alias(value)
`;

export const SHADOWED_FORWARDING = `package demo
fun target(value: Int): Int = value
val target: (Int) -> Int = { it + 1 }
internal fun shadow(value: Int): Int = target(value)
`;
