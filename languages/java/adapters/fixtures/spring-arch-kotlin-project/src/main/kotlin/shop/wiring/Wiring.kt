package shop.wiring

import org.springframework.beans.factory.annotation.Autowired
import org.springframework.context.annotation.Lazy
import org.springframework.stereotype.Service
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

interface Endpoint

@Retention(AnnotationRetention.RUNTIME)
annotation class Store

@Service
class WiringService(
    @Lazy private val wallet: Wallet,
    private val proxied: ProxiedWallet,
    private val draft: Draft,
    private val tenant: Tenant,
    private val ledger: Ledger,
    private val visit: Visit,
    private val label: String = "wiring",
) {
    @Autowired private lateinit var badge: Badge
}

@Store
class AuditStore(private val service: WiringService)

class StatusEndpoint(private val store: AuditStore?) : Endpoint

@RestController
class HealthController {
    @GetMapping("/health")
    fun health(): String = StatusEndpoint(null).toString()
}
