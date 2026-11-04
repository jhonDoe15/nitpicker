package shop

class Tx {
    fun open() {}

    fun step() {}

    fun close() {}
}

fun exclusive(t: Tx, flag: Boolean) {
    if (flag) t.step() else t.open()
}

fun chosen(t: Tx, n: Int) {
    when (n) {
        0 -> t.step()
        else -> t.open()
    }
}

fun sequential(t: Tx, flag: Boolean) {
    if (flag) t.step()
    t.open()
}

fun lambdaInFinally(r: Tx) {
    r.open()
    try {
        r.step()
    } finally {
        val cb = { r.close() }
        cb()
    }
}

fun scopeInFinally(t: Tx) {
    t.open()
    try {
        t.step()
    } finally {
        t.apply { close() }
    }
}

fun receiverBlock(t: Tx) {
    with(t) {
        open()
        step()
    }
}

fun receiverRun(t: Tx) {
    t.run {
        open()
    }
}

fun unknownReceiver(t: Tx, other: Any) {
    t.open()
    with(other) {
        open()
    }
}

fun twoLambdas(a: List<Tx>, b: List<Tx>) {
    a.forEach { it.open() }; b.forEach { it.step() }
}

fun typedLambda(items: List<Tx>) {
    items.forEach { item -> item.open() }
}

fun scoped(a: Tx, b: Tx) {
    val x = a
    val y = b
    x.apply { open() }
    y.also { it.step() }
}
