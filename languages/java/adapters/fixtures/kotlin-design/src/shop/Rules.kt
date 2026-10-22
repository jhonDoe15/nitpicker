package shop

fun label(status: Status): String =
    when (status) {
        Status.NEW, Status.PAID -> "open"
        Status.SHIPPED -> "done"
    }

fun labelElse(order: Order): String =
    when (order.status) {
        Status.NEW -> "n"
        else -> "x"
    }

fun byLevel(account: Account): Int =
    when (account.level) {
        "gold", "silver" -> 1
        "bronze" -> 2
        else -> 3
    }

fun chain(order: Order): Int {
    if (order.note == "a") {
        return 1
    } else if (order.note == "b" || order.note == "c") {
        return 2
    } else {
        return 3
    }
}

fun membership(order: Order): Int = if (order.note in setOf("x", "y")) 1 else 0

fun areaObjects(shape: Shape): Int =
    when (shape) {
        Circle -> 1
        Square -> 2
    }

fun areaIs(shape: Shape): Int =
    when (shape) {
        is Circle -> 1
        is Square -> 2
    }

fun notAnEnum(result: Result): Int =
    when (result) {
        is Ok -> 1
        Failed -> 2
    }

fun comparison(order: Order): Int = if (order.total > 3) 1 else 0

fun subjectless(order: Order): Int =
    when {
        order.status == Status.NEW -> 1
        order.status == Status.PAID || order.status == Status.SHIPPED -> 2
        else -> 3
    }

fun mixedChain(order: Order, flag: Boolean): Int {
    if (order.note == "a") {
        return 1
    } else if (flag) {
        return 2
    }
    return 3
}

fun conditionReads(order: Order): Boolean {
    if (order.status == Status.PAID && order.total > 10) {
        return true
    }
    val note = order.note
    return note.isEmpty()
}

fun enumEquals(order: Order): Int {
    if (Status.NEW == order.status) {
        return 1
    } else if (order.status.equals(Status.PAID)) {
        return 2
    }
    return 0
}

fun lone(order: Order): Int {
    if (order.note == "only") {
        return 1
    }
    return 0
}
