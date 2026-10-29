package shop

import java.util.Collections

fun scopeChange(stores: Stores) {
    stores.reuse().apply { add("x") }
    stores.builtList().also { it.clear() }
    stores.copiedList().let { it.removeAt(0) }
}

fun helperChange(stores: Stores) {
    Collections.sort(stores.reuse())
    Collections.reverse(stores.aliasedList())
}

fun builderChange(buf: Buf) {
    buf.text().appendLine("x")
    buf.text().setLength(0)
}
