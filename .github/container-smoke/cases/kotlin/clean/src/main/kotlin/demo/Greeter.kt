package demo

class Greeter {
    fun greet(name: String): String = "Hello, $name!"

    fun farewell(name: String): String = Farewell().goodbye(name)
}
