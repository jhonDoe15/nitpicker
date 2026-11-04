package shop

class Context(
    val clock: Int,
    val locale: String,
    val region: String,
    val currency: String,
    val tenant: String,
    val debug: Boolean,
) {
    fun describe(): String = "$locale/$region"
}

fun outer(ctx: Context): Int = inner(ctx)

fun inner(ctx: Context): Int = ctx.clock + 1

fun stored(ctx: Context): Holder = Holder(ctx)

class Holder(val ctx: Context)

fun returned(ctx: Context): Context = ctx

fun inLambda(ctx: Context): Int = listOf(1).map { it + ctx.clock }.sum()

fun inEscaping(ctx: Context): () -> Int = { ctx.clock }

fun nullChecked(ctx: Context?): Int = if (ctx == null) 0 else ctx.clock

fun passedWrongPosition(ctx: Context): Int = vararg(1, 2, ctx)

fun vararg(vararg n: Any): Int = n.size

fun unresolved(ctx: Context): Int = unknownFunction(ctx)

fun defaults(ctx: Context, extra: Int = 1): Int = twoArgs(extra, ctx)

fun twoArgs(extra: Int, ctx: Context): Int = ctx.clock + extra

fun named(ctx: Context): Int = twoArgs(ctx = ctx, extra = 3)
