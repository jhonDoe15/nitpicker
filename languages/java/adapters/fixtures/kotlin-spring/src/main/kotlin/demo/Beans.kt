package demo

import jakarta.annotation.Resource
import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext
import org.springframework.beans.factory.BeanFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.context.ApplicationContext
import org.springframework.context.ApplicationContextAware
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.ComponentScan
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Lazy
import org.springframework.context.annotation.Profile
import org.springframework.core.env.Environment
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service

class Repo
class Other

@Service
class FieldInjected {
    @Autowired // violation: SpringConstructorInjection, SpringImmutableBeans
    lateinit var repo: Repo

    @Resource // violation: SpringConstructorInjection, SpringImmutableBeans
    private lateinit var other: Other

    @Value("\${limit}") // violation: SpringConstructorInjection
    private val limit: Int = 0

    @PersistenceContext
    lateinit var entities: EntityManager

    @Autowired // violation: SpringConstructorInjection
    fun use(other: Other) {}
}

@Service
class Annotated @Autowired constructor(private val repo: Repo) // violation: SpringConstructorInjection

@Service
class Overloaded @Autowired constructor(private val repo: Repo) {
    constructor() : this(Repo())
}

@Service
class Mutable(private var counter: Int, private val repo: Repo) { // violation: SpringImmutableBeans
    private var cache = HashMap<String, String>() // violation: SpringImmutableBeans
    private val frozen = listOf(1)

    companion object {
        var shared = 0
    }
}

@Service
class Lazily(@Lazy private val repo: Repo, private val other: Other) { // violation: SpringNoLazyInjection
    @Lazy // violation: SpringImmutableBeans, SpringNoLazyInjection
    @Autowired // violation: SpringConstructorInjection
    lateinit var late: Other
}

@Service
class Locator(
    private val factory: BeanFactory, // violation: SpringNoServiceLocator
    private val context: ApplicationContext, // violation: SpringNoServiceLocator
) : ApplicationContextAware { // violation: SpringNoServiceLocator
    fun find(beanFactory: BeanFactory) {} // violation: SpringNoServiceLocator

    override fun setApplicationContext(applicationContext: ApplicationContext) {} // violation: SpringNoServiceLocator
}

@Configuration // violation: SpringLiteConfiguration
class Wiring(private val factory: BeanFactory)

@Configuration // violation: SpringLiteConfiguration
class Proxied {
    @Bean
    fun repo() = Repo()
}

@Configuration(proxyBeanMethods = false)
class Lite {
    @Bean
    fun repo(@Value("\${name}") name: String) = Repo()
}

@ComponentScan("demo") // violation: SpringNoComponentScan
@SpringBootApplication(scanBasePackages = ["demo"]) // violation: SpringNoComponentScan
class Application

@Service
class Settings(private val environment: Environment, @Value("\${url}") private val url: String) { // violation: SpringTypedConfiguration
    fun read(): String? {
        val home = System.getenv("HOME") // violation: SpringTypedConfiguration
        val java = System.getProperty("java.version")
        val key = environment.getProperty("key") // violation: SpringTypedConfiguration
        return environment.getRequiredProperty("other") + home + java + key // violation: SpringTypedConfiguration
    }
}

@Component
@Profile("dev") // violation: SpringProfileOnConfiguration
class Branching {
    @Profile("prod") // violation: SpringProfileOnConfiguration
    fun run() {}

    @Bean
    @Profile("prod")
    fun fine() = Repo()
}

@Configuration(proxyBeanMethods = false)
@Profile("dev")
class Selected
