package demo

import jakarta.annotation.PostConstruct
import jakarta.persistence.EntityManager
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.bind.DefaultValue
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClient

@Service
class Warmup(
    private val orders: OrderRepo,
    private val entities: EntityManager,
    private val remote: RestClient,
) {
    @PostConstruct
    fun load() {
        orders.count() // violation: SpringNoPostConstructIo
        entities.find(Order::class.java, 1L) // violation: SpringNoPostConstructIo
        remote.get() // violation: SpringNoPostConstructIo
    }

    fun ready() {
        orders.count()
    }
}

@Configuration(proxyBeanMethods = false)
class Secrets(
    @Value("\${service.token:abc123}") val token: String, // violation: SpringValueSecretDefault
    @Value("\${service.token}") val strict: String,
    @Value("\${service.name:demo}") val name: String,
    @Value("\${service.secret:}") val empty: String,
    private val env: Environment,
) {
    fun password(): String? = env.getProperty("db.password", "secret") // violation: SpringValueSecretDefault

    fun host(): String? = env.getProperty("db.host", "localhost")
}

@ConfigurationProperties("app")
class AppSecrets(
    @DefaultValue("changeit") val password: String, // violation: SpringValueSecretDefault
    @DefaultValue("local") val mode: String,
)

@Service
class Registry {
    private val seen = mutableSetOf<String>() // violation: SpringBeanCollectionState
    private val startup = mutableListOf<String>()
    private val guarded = HashMap<String, Int>()
    private val frozen = ArrayList<String>()
    private val counted = LinkedHashMap<String, Int>() // violation: SpringBeanCollectionState

    init {
        startup.add("boot")
    }

    @PostConstruct
    fun prepare() {
        fill()
    }

    private fun fill() {
        startup.add("ready")
    }

    fun remember(name: String) {
        seen.add(name)
    }

    fun tally(name: String) {
        counted[name] = 1
    }

    @Synchronized
    fun count(name: String) {
        guarded[name] = 1
    }

    fun view(): List<String> = frozen
}
