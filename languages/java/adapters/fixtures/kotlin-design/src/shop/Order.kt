package shop

enum class Status { NEW, PAID, SHIPPED }

sealed class Shape

object Circle : Shape()

object Square : Shape()

sealed class Result

class Ok(val value: Int) : Result()

object Failed : Result()

data class Order(val id: String, val status: Status, val total: Int, val note: String)

class Account(val level: String) {
    fun upgrade(): Account = Account("gold")
}
