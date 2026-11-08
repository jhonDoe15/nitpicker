package shop

import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.DynamicPropertyRegistry

@SpringBootTest(properties = ["shop.pricing.currency=USD", "shop.pricing.curency=USD"])
abstract class PricingOverrides {
    fun register(registry: DynamicPropertyRegistry) {
        registry.add("shop.pricing.currncy") { "USD" }
    }
}
