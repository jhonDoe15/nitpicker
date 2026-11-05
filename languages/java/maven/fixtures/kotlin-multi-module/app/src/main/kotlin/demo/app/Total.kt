package demo.app

import demo.core.Adder

class Total {
    fun of(values: List<Int>): Int = values.fold(0) { sum, value -> Adder().add(sum, value) }
}
