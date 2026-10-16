package shop.orders

import org.springframework.stereotype.Service

@Service
class OrderService(private val repository: OrderRepository) {
    fun find(id: Long): OrderDto = OrderDto(repository.findOne(id).id)
}

data class OrderDto(val id: Long?)

fun OrderDto.label(): String = "order $id"
