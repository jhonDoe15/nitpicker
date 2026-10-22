package shop.orders

import org.springframework.data.repository.Repository

interface OrderRepository : Repository<Order, Long> {
    fun findOne(id: Long): Order
}
