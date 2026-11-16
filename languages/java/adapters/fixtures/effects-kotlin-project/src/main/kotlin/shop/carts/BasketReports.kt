package shop.carts

import org.springframework.stereotype.Service

@Service
class BasketReports(private val items: ItemRepository) {
    fun total(basket: Basket): Int {
        var sum = 0
        for (item in basket.items) {
            if (item.deletedAt == null) {
                sum += item.price * item.quantity
            }
        }
        return sum
    }

    fun live(basket: Basket): Int = basket.items.filter { it.deletedAt == null }.size

    fun units(basket: Basket): Int {
        var sum = 0
        for (item in basket.items) {
            if (item.deletedAt != null) {
                continue
            }
            sum += item.quantity
        }
        return sum
    }

    fun dearest(basket: Long): Int {
        var best = 0
        for (item in items.findByBasketIdAndDeletedAtIsNull(basket)) {
            best = maxOf(best, item.price)
        }
        return best
    }

    fun cheapest(basket: Basket): Int {
        var best = Int.MAX_VALUE
        val each = basket.items.iterator()
        while (each.hasNext()) {
            val item = each.next()
            if (item.deletedAt == null && item.price < best) {
                best = item.price
            }
        }
        return best
    }

    fun priced(basket: Basket): Int {
        var sum = 0
        basket.items.forEach {
            if (it.deletedAt == null) {
                sum += it.price
            }
        }
        return sum
    }

    fun hasAny(basket: Basket): Boolean {
        for (item in basket.items) {
            if (item.deletedAt == null) {
                return true
            }
        }
        return false
    }

    fun first(basket: Basket): Item? = basket.items.firstOrNull { it.deletedAt == null }

    fun count(basket: Basket): Int {
        var count = 0
        for (item in basket.items) {
            count += item.quantity
        }
        return count
    }

    fun quantities(basket: Basket): Int = basket.items.sumOf { it.quantity }

    fun everything(basket: Basket): List<Item> = basket.items
}
