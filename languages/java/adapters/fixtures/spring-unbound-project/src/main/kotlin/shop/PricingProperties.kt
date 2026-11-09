package shop

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties("shop.pricing")
data class PricingProperties(
    val currency: String = "EUR",
    val surcharges: Map<String, Int> = emptyMap(),
)
