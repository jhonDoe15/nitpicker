package shop.good

import org.springframework.data.repository.CrudRepository

interface OrderRepository : CrudRepository<Order, Long>

class Order
