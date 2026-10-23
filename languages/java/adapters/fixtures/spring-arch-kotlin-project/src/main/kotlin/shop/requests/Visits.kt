package shop.requests

import org.springframework.stereotype.Component
import org.springframework.stereotype.Service
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.context.annotation.RequestScope
import org.springframework.web.context.request.RequestAttributes
import org.springframework.web.context.request.RequestContextHolder
import java.util.concurrent.atomic.AtomicLong

data class VisitDto(val id: String, val page: String)

@RestController
class VisitController(private val log: VisitLog, private val bag: VisitBag) {
    val last = mutableMapOf<String, VisitDto>()
    private val byId = HashMap<String, VisitDto>()
    private val count = AtomicLong()
    private var current: String? = null

    @PostMapping("/visits")
    fun create(@RequestBody visit: VisitDto) {
        last[visit.id] = visit
    }

    @GetMapping("/visits/{id}")
    fun show(@PathVariable id: String) {
        current = id
    }

    @GetMapping("/audit")
    fun audit(@RequestParam trace: String) {
        SEEN.add(trace)
    }

    @PostMapping("/visits/all")
    fun importAll(@RequestBody all: List<VisitDto>) {
        all.forEach { byId[it.id] = it }
    }

    @PostMapping("/visits/log")
    fun delegate(@RequestBody visit: VisitDto) {
        log.remember(visit)
    }

    @GetMapping("/visits/count")
    fun counted(): Long = count.incrementAndGet()

    @GetMapping("/visits/search")
    fun search(@RequestParam query: String): List<String> = mutableListOf(query)

    @PostMapping("/visits/scoped")
    fun scoped(@RequestBody visit: VisitDto) {
        bag.keep(visit)
    }

    companion object {
        val SEEN = mutableListOf<String>()
    }
}

@Service
class VisitLog {
    private val recent = mutableListOf<Any>()

    fun remember(visit: Any) {
        recent += visit
    }
}

@Component
@RequestScope
class VisitBag {
    private val items = mutableListOf<VisitDto>()

    fun keep(visit: VisitDto) {
        items.add(visit)
    }
}

@Component
class AttributesHolder {
    private var attributes: RequestAttributes? = null

    fun capture() {
        attributes = RequestContextHolder.currentRequestAttributes()
    }
}
