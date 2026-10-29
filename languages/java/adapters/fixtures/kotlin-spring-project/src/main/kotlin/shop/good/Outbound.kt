package shop.good

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.stereotype.Component
import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestOperations
import org.springframework.web.reactive.function.client.WebClient
import org.springframework.web.servlet.view.RedirectView
import org.springframework.web.util.UriComponentsBuilder
import java.net.URI

@Component
class Rates(
    private val template: RestOperations,
    private val client: RestClient,
    private val web: WebClient,
) {
    fun fixed(currency: String, id: String): String? {
        template.getForObject("$BASE/rates/{currency}", String::class.java, currency)
        template.getForEntity("https://rates.example.com/rates/{id}", String::class.java, id)
        client.get().uri("/rates/{currency}", currency).retrieve().body(String::class.java)
        web.get().uri { it.path("/rates").queryParam("c", currency).build() }.retrieve().bodyToMono(String::class.java)
        return fixedHelper(BASE)
    }

    fun templated(currency: String): String? {
        val uri = UriComponentsBuilder.fromUriString(BASE).path("/rates/{c}").buildAndExpand(currency).toUri()
        return template.getForObject(uri, String::class.java)
    }

    fun constantCaller(): String? {
        val address = "$BASE/rates"
        return viaConstant(address)
    }

    private fun viaConstant(address: String): String? = template.getForObject(address, String::class.java)

    private fun fixedHelper(address: String): String? = template.getForObject(address, String::class.java)

    companion object {
        const val BASE = "https://rates.example.com"
    }
}

@ConfigurationProperties("partner")
data class PartnerProperties(val baseUrl: URI)

@Component
class PartnerClient(builder: RestClient.Builder, properties: PartnerProperties) {
    private val client = builder.baseUrl(properties.baseUrl.toString()).build()

    fun rates(currency: String): String? =
        client.get().uri("/rates/{currency}", currency).retrieve().body(String::class.java)
}

@Configuration(proxyBeanMethods = false)
class OutboundConfig {
    @Bean
    fun partner(builder: RestClient.Builder, properties: PartnerProperties): RestClient =
        builder.baseUrl(properties.baseUrl.toString()).build()
}

@Controller
class SafeRedirects {
    @GetMapping("/order")
    fun order(@RequestParam id: String) = "redirect:/orders/$id"

    @GetMapping("/home")
    fun home() = RedirectView("/home")
}
