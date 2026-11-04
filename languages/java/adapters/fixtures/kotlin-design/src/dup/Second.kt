package dup

class Twin {
    fun go(): Int = 2
}

fun useTwin(twin: Twin): Int = twin.go()
