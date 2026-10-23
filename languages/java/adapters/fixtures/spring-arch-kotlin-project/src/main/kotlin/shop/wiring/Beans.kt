package shop.wiring

import org.springframework.context.annotation.Scope
import org.springframework.context.annotation.ScopedProxyMode
import org.springframework.stereotype.Component

@Retention(AnnotationRetention.RUNTIME)
@Scope("session")
annotation class PerSession(val mode: ScopedProxyMode = ScopedProxyMode.TARGET_CLASS)

@Retention(AnnotationRetention.RUNTIME)
@Scope("request")
annotation class PerRequest

@Component
@Scope("request")
class Wallet

@Component
@Scope(value = "request", proxyMode = ScopedProxyMode.TARGET_CLASS)
class ProxiedWallet

@Component
@Scope("prototype")
class Draft

@Component
@Scope("tenant")
class Tenant

@Component
@PerSession
class Ledger

@Component
@PerRequest
class Visit

@Component
@Scope("request")
class Badge
