package shop.orders

import jakarta.persistence.Entity
import jakarta.persistence.Id

@Entity
class Order(@Id val id: Long? = null) {
    companion object {
        fun empty(): Order = Order()
    }
}
