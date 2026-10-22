package demo

import java.net.http.HttpClient
import java.time.Duration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestTemplate
import org.springframework.web.reactive.function.client.WebClient
import reactor.netty.http.client.HttpClient as NettyClient

@Service
class Gateways {
    private val timed = RestClient.builder().requestFactory(timedFactory()).build()
    private val bare = RestClient.builder().build() // violation: SpringHttpClientTimeouts
    private val template = RestTemplate() // violation: SpringHttpClientTimeouts
    private val tuned = RestTemplate().apply { requestFactory = timedFactory() }
    private val plain = HttpClient.newHttpClient() // violation: SpringHttpClientTimeouts
    private val web = WebClient.create() // violation: SpringHttpClientTimeouts
    private val limited = NettyClient.create().responseTimeout(Duration.ofSeconds(5))
    private val unlimited = NettyClient.create() // violation: SpringHttpClientTimeouts
    private val connected = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build()
    private val factory = SimpleClientHttpRequestFactory() // violation: SpringHttpClientTimeouts

    private fun timedFactory() =
        SimpleClientHttpRequestFactory().apply {
            setConnectTimeout(2000)
            setReadTimeout(2000)
        }

    fun fetch(): String {
        val client = RestClient.create() // violation: SpringHttpClientPerCall
        return client.get().uri("/x").retrieve().body(String::class.java).orEmpty()
    }

    fun later(): HttpClient {
        return HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build() // violation: SpringHttpClientPerCall
    }
}

@Configuration(proxyBeanMethods = false)
class ClientBeans {
    @Bean
    fun clientTemplate(): RestTemplate = RestTemplate() // violation: SpringHttpClientTimeouts

    @Bean
    fun clientWeb(): WebClient = WebClient.builder().baseUrl("http://x").build() // violation: SpringHttpClientTimeouts
}
