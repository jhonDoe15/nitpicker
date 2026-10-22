package shop.sales

import org.jmolecules.ddd.types.AggregateRoot
import org.jmolecules.ddd.types.Association
import org.jmolecules.ddd.types.Entity
import org.jmolecules.ddd.types.Identifier

data class OrderId(val value: Long) : Identifier

data class CustomerId(val value: Long) : Identifier

data class CartId(val value: Long) : Identifier

class Customer(private val id: CustomerId) : AggregateRoot<Customer, CustomerId> {
    override fun getId(): CustomerId = id
}

class Cart(private val id: CartId) : AggregateRoot<Cart, CartId> {
    override fun getId(): CartId = id
}

class CartLine(private val id: Long) : Entity<Cart, Long> {
    override fun getId(): Long = id
}

class Order(
    private val id: OrderId,
    val customer: Customer,
    val buyer: Association<Customer, CustomerId>,
    val lines: List<CartLine>,
) : AggregateRoot<Order, OrderId> {
    override fun getId(): OrderId = id
}
