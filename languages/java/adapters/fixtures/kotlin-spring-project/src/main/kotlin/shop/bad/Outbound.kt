package shop.bad

import org.springframework.http.HttpEntity
import org.springframework.http.HttpMethod
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.stereotype.Component
import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestOperations
import org.springframework.web.client.getForObject
import org.springframework.web.reactive.function.client.WebClient
import org.springframework.web.servlet.view.RedirectView
import java.net.URI
import java.net.http.HttpRequest

data class Target(val url: String, val currency: String)

@Component
class Outbound(
    private val template: RestOperations,
    private val client: RestClient,
    private val web: WebClient,
) {
    fun template(url: String, host: String): String? {
        val plain = template.getForObject(url, String::class.java)
        template.exchange(url, HttpMethod.GET, HttpEntity.EMPTY, String::class.java)
        template.postForObject(URI.create(url), "x", String::class.java)
        template.getForObject<String>("https://$host/rates")
        val derived = url.trim()
        template.getForObject(derived, String::class.java)
        return plain
    }

    fun clients(url: String): String? {
        web.get().uri(url, "x").retrieve().bodyToMono(String::class.java)
        return client.get().uri(url).retrieve().body(String::class.java)
    }

    fun created(url: String): RestClient = RestClient.create(url)

    fun chained(url: String): String? {
        val first = url
        val second = first.trim() + "/rates"
        template.getForObject(second, String::class.java)
        var again = BASE
        again = url
        return template.getForObject(again, String::class.java)
    }

    fun accessors(target: Target): String? {
        client.get().uri(target.url).retrieve().body(String::class.java)
        return template.getForObject("$BASE/rates/{currency}", String::class.java, target.currency)
    }

    fun lambdas(host: String) =
        web.get().uri { it.scheme("https").host(host).build() }.retrieve().bodyToMono(String::class.java)

    fun jdk(url: String): HttpRequest = HttpRequest.newBuilder(URI.create(url)).build()

    fun jdkUri(url: String): HttpRequest = HttpRequest.newBuilder().uri(URI.create(url)).build()

    fun viaHelper(url: String): String? = fetch(url)

    private fun fetch(address: String): String? = template.getForObject(address, String::class.java)

    companion object {
        const val BASE = "https://rates.example.com"
    }
}

class Webhook(target: String, factory: SimpleClientHttpRequestFactory) {
    private val client = RestClient.builder().requestFactory(factory).baseUrl(target).build()

    fun ping(): String? = client.get().retrieve().body(String::class.java)
}

@Controller
class Redirects {
    @GetMapping("/next")
    fun next(@RequestParam next: String) = "redirect:$next"

    @GetMapping("/view")
    fun view(@RequestParam next: String): RedirectView {
        val target = next.trim()
        return RedirectView(target)
    }

    @GetMapping("/joined")
    fun joined(@RequestParam next: String): String {
        return "redirect:" + next
    }
}
