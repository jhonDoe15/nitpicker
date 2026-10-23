package shop.good

import jakarta.annotation.PostConstruct
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.context.NullSecurityContextRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.client.RestClient
import shop.LegacyRepository
import java.net.http.HttpClient
import java.time.Duration
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

@Configuration(proxyBeanMethods = false)
class HttpConfig {
    @Bean
    fun jdk(): HttpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build()

    @Bean
    fun rest(): RestClient = RestClient.builder().requestFactory(factory()).build()

    @Bean(initMethod = "warm")
    fun loader() = Loader()

    @Bean
    fun stateless(http: HttpSecurity): SecurityFilterChain =
        http.sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
            .csrf { it.disable() }
            .build()

    @Bean
    fun contextless(http: HttpSecurity): SecurityFilterChain =
        http.securityContext { it.securityContextRepository(NullSecurityContextRepository()) }
            .csrf { it.disable() }
            .build()

    private fun factory() =
        SimpleClientHttpRequestFactory().apply {
            setConnectTimeout(Duration.ofSeconds(1))
            setReadTimeout(Duration.ofSeconds(1))
        }
}

class Loader {
    fun warm() = Unit
}

@Service
class Ledger(private val legacy: LegacyRepository) {
    private val lock = ReentrantLock()
    private val seen = HashMap<Long, Long>()

    @PostConstruct
    fun start() {
        prime()
    }

    private fun prime() {
        seen[0] = 0
    }

    @Synchronized
    fun mark(id: Long) {
        seen[id] = id
    }

    fun forget(id: Long) = lock.withLock { seen.remove(id) }

    fun clear() {
        lock.lock()
        try {
            seen.clear()
        } finally {
            lock.unlock()
        }
    }

    @Transactional(readOnly = true)
    fun total(): Long = legacy.count()

    @Transactional
    fun settle(id: Long) {
        apply(id)
    }

    private fun apply(id: Long) {
        try {
            legacy.deleteById(id)
        } catch (e: IllegalArgumentException) {
            throw IllegalStateException("missing", e)
        }
    }

    @Transactional
    @Throws(LedgerFailure::class)
    fun close() = Unit
}

class LedgerFailure(message: String) : IllegalStateException(message)
