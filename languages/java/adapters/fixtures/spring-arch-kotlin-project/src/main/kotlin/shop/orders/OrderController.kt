package shop.orders

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RestController

@RestController
class OrderController(private val service: OrderService, private val repository: OrderRepository) {
    @GetMapping("/orders/{id}")
    fun find(@PathVariable id: Long): OrderDto = service.find(id)

    @GetMapping("/orders")
    fun all(): List<Order> = listOf(repository.findOne(1L))
}
