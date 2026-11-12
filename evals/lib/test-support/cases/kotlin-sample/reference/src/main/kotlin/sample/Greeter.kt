package sample

import java.util.Locale

class Greeter {
    fun greet(name: String): String = "Hello, $name!"

    fun shout(name: String): String = greet(name).uppercase(Locale.ROOT)
}
