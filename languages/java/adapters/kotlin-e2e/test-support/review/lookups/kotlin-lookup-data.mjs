const MAIN = 'src/main/kotlin/demo/orders';

const CHECKOUT = `package demo.orders

import com.google.inject.Injector
import jakarta.enterprise.inject.spi.CDI
import javax.naming.InitialContext
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject
import org.koin.core.context.GlobalContext

class Pricing

class Checkout(private val injector: Injector) : KoinComponent {
    private val pricing: Pricing by inject()

    fun fromGuice(): Pricing = injector.getInstance(Pricing::class.java)

    fun fromGlobal(): Pricing = GlobalContext.get().get<Pricing>()

    fun fromCdi(): Pricing = CDI.current().select(Pricing::class.java).get()

    fun fromJndi(): Any = InitialContext().lookup("java:comp/env/pricing")

    fun held(): Pricing = pricing
}
`;

const WIRING = `package demo.orders

import com.google.inject.AbstractModule
import com.google.inject.Injector
import com.google.inject.Provides
import jakarta.enterprise.inject.Produces
import jakarta.enterprise.inject.spi.CDI
import org.koin.core.component.get
import org.koin.dsl.module

val ordersModule = module {
    single { Pricing() }
    single { Checkout(get()) }
}

open class BaseModule : AbstractModule()

class PricingModule : BaseModule() {
    @Provides
    fun checkout(injector: Injector): Checkout = injector.getInstance(Checkout::class.java)
}

class Producers {
    @Produces
    fun pricing(): Pricing = CDI.current().select(Pricing::class.java).get()
}
`;

const APP = `package demo.orders

import com.google.inject.Guice
import org.koin.core.context.startKoin

fun main() {
    startKoin { modules(ordersModule) }
    val injector = Guice.createInjector(PricingModule())
    println(injector.getInstance(Checkout::class.java).held())
}
`;

export const LOOKUP_FILES = {
  [`${MAIN}/Checkout.kt`]: CHECKOUT,
  [`${MAIN}/Wiring.kt`]: WIRING,
  [`${MAIN}/App.kt`]: APP,
};

export const EXPECTED_LOOKUP_FINDINGS = [
  'ServiceLocatorLookup Checkout.fromCdi: CDI.current()',
  'ServiceLocatorLookup Checkout.fromGlobal: GlobalContext.get()',
  'ServiceLocatorLookup Checkout.fromGuice: Injector.getInstance()',
  'ServiceLocatorLookup Checkout.fromJndi: InitialContext.lookup()',
  'ServiceLocatorLookup Checkout: Koin inject()',
];

export function lookupBuild(build) {
  return `${build}
dependencies {
    compileOnly("io.insert-koin:koin-core:4.0.4")
    compileOnly("com.google.inject:guice:7.0.0")
    compileOnly("jakarta.enterprise:jakarta.enterprise.cdi-api:4.0.1")
}
`;
}
