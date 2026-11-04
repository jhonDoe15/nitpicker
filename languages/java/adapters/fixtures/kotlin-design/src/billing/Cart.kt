package billing

class Cart {
    fun total(): Int = 0

    fun price(sku: String): Int = 1

    fun price(sku: Int): Int = 2
}
