package shop.carts

import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.OneToMany
import java.time.Instant
import org.springframework.data.jpa.repository.JpaRepository

@Entity
class Item(@Id val id: Long, val quantity: Int, val price: Int, val deletedAt: Instant?)

@Entity
class Basket(@Id val id: Long, @OneToMany(mappedBy = "basket") val items: List<Item>)

interface ItemRepository : JpaRepository<Item, Long> {
    fun findByBasketIdAndDeletedAtIsNull(basket: Long): List<Item>
}
