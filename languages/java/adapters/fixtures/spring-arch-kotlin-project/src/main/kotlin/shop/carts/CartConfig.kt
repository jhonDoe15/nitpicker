package shop.carts

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

class Pricing(val source: Any)

@Configuration
class CartConfig {
    @Bean
    fun pricing(basket: Basket): Pricing = Pricing(basket)
}
