package shop.bad.settings

import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment

@ConfigurationProperties("shop.token")
class TokenProperties(val issuerUri: String? = null, val signing: Signing = Signing()) {
    var bundle: String? = null

    fun sslEnabled(): Boolean = bundle != null

    class Signing(val keyId: String? = null)
}

@Configuration(proxyBeanMethods = false)
class TokenConfig(
    private val properties: TokenProperties,
    @Value("\${shop.region:}") private val region: String?,
) {
    @Bean
    fun tokenIssuer(): String {
        if (properties.issuerUri != null) {
            return properties.issuerUri
        }
        return "local"
    }

    @Bean
    fun tokenKey(): String = properties.signing.keyId ?: region ?: "eu"

    @Bean
    fun tokenAudience(@Value("\${shop.audience:#{null}}") audience: String?): String {
        val audiences = mutableListOf<String>()
        audience?.let { audiences.add(it) }
        return audiences.joinToString()
    }

    @Bean
    fun tokenScope(environment: Environment): String {
        if (environment.containsProperty("shop.scope")) {
            return environment.getRequiredProperty("shop.scope")
        }
        return if (environment.getProperty("shop.realm") != null) "realm" else "all"
    }
}
