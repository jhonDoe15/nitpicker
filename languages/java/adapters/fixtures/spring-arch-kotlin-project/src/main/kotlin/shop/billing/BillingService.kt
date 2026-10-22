package shop.billing

import org.springframework.http.ResponseEntity
import org.springframework.stereotype.Service
import shop.orders.OrderService
import shop.orders.internal.Audit

@Service
class BillingService(private val orders: OrderService) {
    fun bill(id: Long): String = Audit.stamp() + orders.find(id)

    fun reply(): ResponseEntity<String> = ResponseEntity.ok("billed")
}
