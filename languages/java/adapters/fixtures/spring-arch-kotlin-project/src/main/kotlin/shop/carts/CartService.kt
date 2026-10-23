package shop.carts

import org.springframework.beans.factory.ObjectProvider
import org.springframework.stereotype.Service

@Service
class CartService(
    private val cart: Cart,
    private val baskets: ObjectProvider<Basket>,
    private val history: List<Basket>,
)
