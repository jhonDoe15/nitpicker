package shop.bad

import jakarta.annotation.PostConstruct
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.web.client.RestTemplateBuilder
import org.springframework.context.ApplicationContext
import org.springframework.context.annotation.ComponentScan
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Lazy
import org.springframework.context.annotation.Profile
import org.springframework.core.env.Environment
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestTemplate

@Service
class FieldInjected {
    @Autowired
    lateinit var orders: OrderRepository

    @Value("\${shop.api.token:changeme}")
    lateinit var token: String

    var counter = 0

    private val cache = HashMap<String, Int>()

    fun remember(key: String) {
        cache[key] = 1
    }

    @Autowired
    fun setClock(clock: java.time.Clock) {}
}

@Service
class Locator(private val context: ApplicationContext, @Lazy private val other: FieldInjected) {
    fun find() = context.getBean(FieldInjected::class.java)
}

@Configuration
@ComponentScan("shop")
@Profile("dev")
class AppConfig

@SpringBootApplication(scanBasePackages = ["shop"])
class App

@Service
class Remote(@Value("\${remote.url}") private val url: String, private val environment: Environment) {
    private val client = RestClient.create()

    fun fetch(): String? {
        val template = RestTemplate()
        return template.getForObject(url + environment.getProperty("remote.path"), String::class.java)
    }

    fun builder() = RestTemplateBuilder().build()
}

@Service
class Warmup(private val orders: OrderRepository) {
    @PostConstruct
    fun load() {
        orders.findAll()
    }
}

@Profile("prod")
@Service
class ProdOnly {
    fun read() = System.getProperty("shop.mode")
}
