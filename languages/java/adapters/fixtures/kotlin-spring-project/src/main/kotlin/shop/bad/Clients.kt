package shop.bad

import jakarta.annotation.PostConstruct
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.core.userdetails.User
import org.springframework.security.core.userdetails.UserDetails
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestTemplate
import shop.LegacyRepository
import java.io.IOException
import java.net.http.HttpClient

@Configuration(proxyBeanMethods = false)
class HttpConfig {
    @Bean
    fun jdk(): HttpClient = HttpClient.newHttpClient()

    @Bean
    fun rest(): RestClient = RestClient.builder().build()

    @Bean
    fun viaHelper(): RestTemplate = template()

    @Bean(initMethod = "warm")
    fun loader(legacy: LegacyRepository) = Loader(legacy)

    @Bean
    fun admin(): UserDetails {
        val secret = "admin"
        return User.withUsername("admin").password(secret).roles("ADMIN").build()
    }

    private fun template() = RestTemplate()
}

class Loader(private val legacy: LegacyRepository) {
    fun warm() {
        legacy.findAll()
    }
}

@Service
class Ledger(private val legacy: LegacyRepository) {
    @PostConstruct
    fun start() {
        prime()
    }

    private fun prime() {
        legacy.count()
    }

    @Transactional(readOnly = true)
    fun total(): Long {
        legacy.deleteAll()
        return legacy.count()
    }

    @Transactional
    fun settle(id: Long) {
        apply(id)
    }

    private fun apply(id: Long) {
        try {
            legacy.deleteById(id)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    @Transactional
    @Throws(LedgerException::class)
    fun close() = Unit
}

class LedgerException(message: String) : IOException(message)
