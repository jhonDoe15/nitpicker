const SCREENS = `package demo

import androidx.appcompat.app.AppCompatActivity
import androidx.compose.runtime.Composable
import org.koin.android.ext.android.inject
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject

class OrdersViewModel

class Clock

@Composable
fun OrdersScreen(viewModel: OrdersViewModel = koinViewModel()) {
    val clock: Clock = koinInject()
}

class OrdersActivity : AppCompatActivity() {
    private val viewModel: OrdersViewModel by inject()
}
`;

const QUALIFIED = `package demo

class Repo

class Global {
    fun fromGlobal(): Repo = org.koin.core.context.GlobalContext.get().get<Repo>()

    fun fromJndi(): Any = javax.naming.InitialContext().lookup("x")

    fun entry(directory: javax.naming.directory.DirContext): Any = directory.lookup("cn=orders")
}
`;

const RECEIVERS = `package demo

import com.google.inject.Guice
import com.google.inject.Injector
import org.koin.core.Koin
import org.koin.core.parameter.parametersOf
import org.koin.core.scope.Scope

typealias Di = Injector

class Holder(val injector: Injector)

class Lazily(private val other: Holder, private val koin: Koin, private val di: Di) {
    private val injector by lazy { Guice.createInjector() }

    fun fromLazy(): Repo = injector.getInstance(Repo::class.java)

    fun fromOther(): Repo = other.injector.getInstance(Repo::class.java)

    fun fromKoin(id: String): Repo = koin.get<Repo> { parametersOf(id) }

    fun reference(): (Class<Repo>) -> Repo = di::getInstance
}

class Scoped(private val scope: Scope) {
    fun load(): Repo = scope.get()
}

class Counts(private val scope: Map<String, Int>) {
    fun load(): Int? = scope.get("a")
}

fun create(scope: Scope): Repo = scope.get()
`;

const ROOTS = `package demo

import com.google.inject.AbstractModule
import com.google.inject.Guice
import com.google.inject.Injector
import org.koin.core.component.*
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.jndi.JndiTemplate

class Wiring : AbstractModule() {
    private lateinit var parent: Injector

    override fun configure() {
        bind(Repo::class.java).toInstance(parent.getInstance(Repo::class.java))
    }

    fun fallback(): Repo = parent.getInstance(Repo::class.java)
}

object Launcher {
    @JvmStatic
    fun main(args: Array<String>) {
        println(Guice.createInjector(Wiring()).getInstance(Repo::class.java))
    }

    fun again(injector: Injector): Repo = injector.getInstance(Repo::class.java)
}

@Configuration
class DataConfig {
    @Bean
    fun legacy(): Any = JndiTemplate().lookup("java:comp/env/jdbc/legacy")

    fun audit(): Any = JndiTemplate().lookup("java:comp/env/jdbc/audit")
}

class Grid : KoinComponent {
    operator fun get(index: Int): Int = index

    fun cell(): Int = get(1)

    fun repo(): Repo = get()
}
`;

const ENTRY = `package demo

fun main() {
    println(javax.naming.InitialContext().lookup("java:comp/env/start"))
}

fun again(): Any = javax.naming.InitialContext().lookup("java:comp/env/again")
`;

export const LOOKUP_FACT_SOURCES = {
  'src/demo/Screens.kt': SCREENS,
  'src/demo/Qualified.kt': QUALIFIED,
  'src/demo/Receivers.kt': RECEIVERS,
  'src/demo/Roots.kt': ROOTS,
  'src/demo/Entry.kt': ENTRY,
};

export const EXPECTED_LOOKUP_FACT_FINDINGS = [
  'src/demo/Entry.kt again: InitialContext.lookup()',
  'src/demo/Qualified.kt Global.fromGlobal: GlobalContext.get()',
  'src/demo/Qualified.kt Global.fromJndi: InitialContext.lookup()',
  'src/demo/Receivers.kt Lazily.fromKoin: Koin.get()',
  'src/demo/Receivers.kt Lazily.fromLazy: Injector.getInstance()',
  'src/demo/Receivers.kt Lazily.fromOther: Injector.getInstance()',
  'src/demo/Receivers.kt Lazily.reference: Injector.getInstance()',
  'src/demo/Receivers.kt Scoped.load: Scope.get()',
  'src/demo/Roots.kt DataConfig.audit: JndiTemplate.lookup()',
  'src/demo/Roots.kt Grid.repo: Koin get()',
  'src/demo/Roots.kt Launcher.again: Injector.getInstance()',
  'src/demo/Roots.kt Wiring.fallback: Injector.getInstance()',
  'src/demo/Screens.kt OrdersScreen: Koin koinInject()',
];
