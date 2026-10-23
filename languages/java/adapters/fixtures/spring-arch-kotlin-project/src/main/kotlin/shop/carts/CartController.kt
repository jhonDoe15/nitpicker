package shop.carts

import org.springframework.stereotype.Repository
import org.springframework.web.bind.annotation.RestController
import shop.orders.OrderController

@RestController
class CartController(private val service: CartService, private val orders: OrderController)

@Repository
class CartRepository(private val service: CartService)
