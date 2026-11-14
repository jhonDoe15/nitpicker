package shop.bad

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestOperations
import org.springframework.web.reactive.function.client.WebClient
import java.net.URI

data class Partner(val host: String, val port: Int, val name: String)

class NextForm(var next: String = "", var count: Int = 0)

private fun fetchTop(template: RestOperations, address: String) = template.getForObject(address, String::class.java)

class Scoped(private val template: RestOperations) {
    fun scoped(url: String) {
        url.let { template.getForObject(it, String::class.java) }
        url.also { target -> template.getForObject(target, String::class.java) }
        url.run { template.getForObject(this, String::class.java) }
        with(url) { template.getForObject(this, String::class.java) }
    }

    fun results(url: String): String? {
        val built = url.let { "https://$it/rates" }
        return template.getForObject(built, String::class.java)
    }

    fun appended(url: String): String? {
        var target = BASE
        target += url
        return template.getForObject(target, String::class.java)
    }

    fun destructured(url: String): String? {
        val (first, _) = url.split("#")
        return template.getForObject(first, String::class.java)
    }

    fun nested(host: String) = template.getForObject("https://${host.ifEmpty { "x" }}/rates", String::class.java)

    fun long(url: String) = template.getForObject(
        listOf("first-segment-that-is-long", "second-segment-that-is-long", "third-segment-that-is-long",
            "fourth-segment-that-is-long", "fifth-segment-that-is-long").joinToString("/") + url,
        String::class.java,
    )

    fun partner(partner: Partner) = template.getForObject("https://${partner.host}/x", String::class.java)

    fun builder(web: WebClient, port: String, user: String) {
        web.get().uri { it.scheme("https").host(HOST).port(port).build() }.retrieve()
        web.get().uri { it.scheme("https").host(HOST).userInfo(user).build() }.retrieve()
    }

    companion object {
        const val BASE = "https://partner.example.com"
        const val HOST = "partner.example.com"
    }
}

class Hook(endpoint: String, private val client: RestClient) {
    private val target = endpoint

    fun ping() = client.get().uri(target).retrieve().body(String::class.java)
}

class Helpers(private val template: RestOperations) {
    fun viaTop(url: String) = fetchTop(template, url)

    fun viaCompanion(url: String) = fetchCompanion(template, url)

    fun viaLocal(url: String): String? {
        fun local(address: String) = template.getForObject(address, String::class.java)
        return local(url)
    }

    fun viaExtension(url: String) = url.fetchAsTarget()

    private fun String.fetchAsTarget() = template.getForObject(this, String::class.java)

    fun overloads(url: String) = load(url)

    fun fixed() = load(URI.create(BASE))

    private fun load(address: String) = template.getForObject(address, String::class.java)

    private fun load(address: URI) = template.getForObject(address, String::class.java)

    companion object {
        const val BASE = "https://partner.example.com"

        private fun fetchCompanion(template: RestOperations, address: String) =
            template.getForObject(address, String::class.java)
    }
}

class Inferred {
    private val rest = RestClient.create()

    fun viaProperty(url: String) = rest.get().uri(url).retrieve().body(String::class.java)

    fun viaLocal(url: String): String? {
        val client = RestClient.builder().build()
        return client.get().uri(url).retrieve().body(String::class.java)
    }

    fun viaWeb(url: String) {
        val client = WebClient.create()
        client.get().uri(url).retrieve()
    }
}

@Controller
class RedirectSinks {
    @GetMapping("/send")
    fun send(@RequestParam next: String, response: HttpServletResponse) = response.sendRedirect(next)

    @GetMapping("/located")
    fun located(@RequestParam next: String): ResponseEntity<Void> =
        ResponseEntity.status(HttpStatus.FOUND).location(URI.create(next)).build()

    @GetMapping("/created")
    fun created(@RequestParam next: String): ResponseEntity<Void> = ResponseEntity.created(URI.create(next)).build()

    @GetMapping("/header")
    fun header(@RequestParam next: String): ResponseEntity<Void> =
        ResponseEntity.status(HttpStatus.FOUND).header(HttpHeaders.LOCATION, next).build()

    @GetMapping("/headers")
    fun headers(@RequestParam next: String): ResponseEntity<Void> {
        val headers = HttpHeaders()
        headers.location = URI.create(next)
        return ResponseEntity(headers, HttpStatus.FOUND)
    }

    @GetMapping("/servlet")
    fun servletHeader(@RequestParam next: String, response: HttpServletResponse) = response.setHeader("Location", next)

    @GetMapping("/form")
    fun form(form: NextForm) = "redirect:${form.next}"

    @GetMapping("/params")
    fun params(@RequestParam params: Map<String, String>) = "redirect:" + params["next"]

    @GetMapping("/request")
    fun request(request: HttpServletRequest) = "redirect:${request.getParameter("next")}"

    @GetMapping("/scoped")
    fun scoped(@RequestParam next: String) = next.let { "redirect:$it" }
}
