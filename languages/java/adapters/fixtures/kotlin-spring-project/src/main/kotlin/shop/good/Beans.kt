package shop.good

import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.ApplicationRunner
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.runApplication
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.web.client.RestTemplateBuilder
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestTemplate
import java.time.Duration
import java.util.concurrent.ConcurrentHashMap

@ConfigurationProperties("shop.remote")
data class RemoteProperties(val url: String, val timeout: Duration)

@Service
class OrderService(
    private val orders: OrderRepository,
    private val clock: java.time.Clock,
    private val others: ObjectProvider<Helper>,
) {
    private val cache = ConcurrentHashMap<String, Int>()
    private val names = HashMap<String, Int>()
    private val defaults: Map<String, Int>

    init {
        names["a"] = 1
        defaults = names.toMap()
    }

    @PersistenceContext
    private lateinit var entityManager: EntityManager

    fun remember(key: String) {
        cache[key] = 1
        synchronized(this) { names.remove(key) }
    }

    fun total() = orders.count() + clock.millis()
}

class Helper

@Configuration(proxyBeanMethods = false)
class AppConfig {
    @Bean
    fun restClient(builder: RestClient.Builder, properties: RemoteProperties): RestClient =
        builder.baseUrl(properties.url).build()

    @Bean
    fun template(builder: RestTemplateBuilder): RestTemplate =
        builder.connectTimeout(Duration.ofSeconds(2)).readTimeout(Duration.ofSeconds(5)).build()

    @Bean
    fun legacy(): RestTemplate =
        RestTemplate(SimpleClientHttpRequestFactory().apply { setConnectTimeout(1000); setReadTimeout(1000) })

    @Bean
    @Profile("dev")
    fun seed(orders: OrderRepository) = ApplicationRunner { orders.count() }

    @Bean
    fun secret(@Value("\${shop.api.token}") token: String) = token
}

@SpringBootApplication
class ShopApplication

fun main(args: Array<String>) {
    System.getProperty("user.home")
    runApplication<ShopApplication>(*args)
}

@Service
class Client(builder: RestClient.Builder) {
    private val client = builder.build()

    companion object {
        fun timed(): RestTemplate = RestTemplateBuilder().connectTimeout(Duration.ofSeconds(1)).readTimeout(Duration.ofSeconds(1)).build()
    }

    fun fetch(): String? = client.get().retrieve().body(String::class.java)
}
