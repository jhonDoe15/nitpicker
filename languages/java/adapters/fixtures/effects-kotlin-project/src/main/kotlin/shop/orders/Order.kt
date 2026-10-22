package shop.orders

import jakarta.persistence.Entity
import jakarta.persistence.Id
import java.math.BigDecimal

@Entity
class Order(@Id val id: Long, val total: BigDecimal)
