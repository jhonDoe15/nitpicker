package shop.good.settings

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@ConfigurationProperties("shop.token")
class TokenProperties(val issuerUri: String? = null, val retries: Int? = null) {
    var bundle: String? = null

    fun sslEnabled(): Boolean = !bundle.isNullOrBlank()

    fun trimmed(): String? = bundle?.trim()
}

@Configuration(proxyBeanMethods = false)
class TokenConfig(private val properties: TokenProperties) {
    @Bean
    fun tokenIssuer(): String {
        if (properties.issuerUri != null && properties.issuerUri.isNotBlank()) {
            return properties.issuerUri
        }
        return properties.issuerUri?.ifBlank { null } ?: "local"
    }

    @Bean
    fun tokenRetries(): Int = properties.retries ?: 3

    @Bean
    fun tokenBundle(): String = properties.bundle ?: ""
}
