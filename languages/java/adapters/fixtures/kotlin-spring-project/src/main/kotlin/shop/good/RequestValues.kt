package shop.good

import org.slf4j.LoggerFactory
import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.client.RestOperations
import org.springframework.web.servlet.view.RedirectView

data class Partner(val host: String, val port: Int)

private val partnerUrl = "https://partner.example.com"

class SafeScopes(private val template: RestOperations) {
    fun shadowedLambda(url: String, ids: List<Int>) =
        ids.map { url -> template.getForObject("$BASE/$url", String::class.java) }

    fun shadowedLocal(url: String): String? {
        run {
            val url = BASE
            return template.getForObject(url, String::class.java)
        }
    }

    fun escaped(url: String) = template.getForObject("$BASE/\$url", String::class.java)

    fun commented(url: String) = template.getForObject(/* url */ BASE, String::class.java)

    fun received(url: String) = url.run { template.getForObject(partnerUrl, String::class.java) }

    fun port(partner: Partner) = template.getForObject("$BASE:${partner.port}/x", String::class.java)

    fun fixed() = fetch(BASE)

    private fun fetch(address: String) = template.getForObject(address, String::class.java)

    companion object {
        const val BASE = "https://partner.example.com"
    }
}

@Controller
class ChosenRedirects {
    private val log = LoggerFactory.getLogger(ChosenRedirects::class.java)

    @GetMapping("/chosen")
    fun chosen(@RequestParam next: String): String {
        val target = when (next) {
            "orders" -> "/orders"
            "cart" -> "/cart"
            else -> "/"
        }
        return "redirect:$target"
    }

    @GetMapping("/looked")
    fun looked(@RequestParam next: String) = "redirect:${ALLOWED[next] ?: "/"}"

    @GetMapping("/fallback")
    fun fallback(@RequestParam next: String) = "redirect:${ALLOWED.getOrDefault(next, "/")}"

    @GetMapping("/branched")
    fun branched(@RequestParam next: String): String {
        val target = if (next == "orders") "/orders" else "/"
        return "redirect:$target"
    }

    @GetMapping("/view")
    fun view(@RequestParam next: String) = RedirectView(if (next.startsWith("/a")) "/a" else "/b")

    @GetMapping("/logged")
    fun logged(@RequestParam next: String): String {
        log.info("redirect:$next is not followed")
        return "redirect:/"
    }

    companion object {
        private val ALLOWED = mapOf("orders" to "/orders")
    }
}
