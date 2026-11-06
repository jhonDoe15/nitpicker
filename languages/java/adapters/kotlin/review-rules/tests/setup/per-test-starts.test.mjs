import { describe, expect, it } from 'vitest';
import { rulesOf } from '../../test-support/sources.mjs';
import { PER_TEST_START_RULE } from './per-test-starts.mjs';

const starts = (text) => rulesOf(text, PER_TEST_START_RULE);

const JUNIT = `package demo

import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.junit5.WireMockExtension
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.junit.jupiter.api.extension.RegisterExtension
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
`;

const KOTEST = `package demo

import io.kotest.core.spec.style.FunSpec
import io.kotest.extensions.testcontainers.ContainerExtension
import io.kotest.extensions.testcontainers.ContainerLifecycleMode
import io.kotest.extensions.testcontainers.perTest
import okhttp3.mockwebserver.MockWebServer
import org.testcontainers.containers.GenericContainer
`;

describe('containers, servers and processes started for each test in Kotlin', () => {
  it('reports @Container, @Rule and @RegisterExtension properties of a JUnit instance', () => {
    const text = `${JUNIT}import org.junit.Rule
import com.github.tomakehurst.wiremock.junit.WireMockRule

@Testcontainers
class RepositoryTest {
    @Container
    val database = PostgreSQLContainer("postgres:16")

    @get:Rule
    val rule = WireMockRule(0)

    @RegisterExtension
    val wireMock: WireMockExtension = WireMockExtension.newInstance().build()

    val plain = GenericContainer("redis:7")

    companion object {
        @Container
        val shared = GenericContainer("redis:7")

        @JvmStatic
        @RegisterExtension
        val sharedWireMock: WireMockExtension = WireMockExtension.newInstance().build()
    }

    @Test
    fun reads() {
        database.jdbcUrl
    }
}
`;

    expect(starts(text)).toEqual(['RepositoryTest@21', 'RepositoryTest@24', 'RepositoryTest@27']);
  });

  it('leaves the properties of a PER_CLASS class alone', () => {
    const text = `${JUNIT}
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class RepositoryTest {
    @Container
    val database = PostgreSQLContainer("postgres:16")

    @RegisterExtension
    val wireMock: WireMockExtension = WireMockExtension.newInstance().build()

    @BeforeEach
    fun start() {
        database.start()
    }

    @Test
    fun reads() {
        database.jdbcUrl
    }
}
`;

    expect(starts(text)).toEqual([]);
  });

  it('reports a start in @BeforeEach on an object made for each test', () => {
    const text = `${JUNIT}
class ServerTest {
    private val perInstance = GenericContainer("redis:7")
    private lateinit var assigned: WireMockServer

    @BeforeEach
    fun start() {
        perInstance.start()
        assigned = WireMockServer(0)
        assigned.start()
        GenericContainer("redis:7").start()
        val local = WireMockServer(0)
        local.start()
        startHelper()
        STOPPED.start()
        ONCE.start()
        ProcessBuilder("git", "init").start()
    }

    private fun startHelper() {
        val helper = WireMockServer(0)
        helper.start()
    }

    @AfterEach
    fun stop() {
        STOPPED.stop()
    }

    @Test
    fun calls() {
        assigned.port()
    }

    companion object {
        private val ONCE = GenericContainer("redis:7")
        private val STOPPED = GenericContainer("redis:7")

        @BeforeAll
        @JvmStatic
        fun startOnce() {
            ONCE.start()
        }
    }
}
`;

    expect(starts(text)).toEqual([
      'ServerTest@22',
      'ServerTest@24',
      'ServerTest@25',
      'ServerTest@27',
      'ServerTest@29',
      'ServerTest@31',
      'ServerTest@36',
    ]);
  });

  it('reports the same start in two or more tests of a class, not starts with other settings', () => {
    const text = `${JUNIT}
class ProcessTest {
    @Test
    fun initializesTheFirst() {
        val server = WireMockServer(8089)
        server.start()
        ProcessBuilder("git", "init").start()
    }

    @Test
    fun initializesTheSecond() {
        val server = WireMockServer(8089) // the same server
        server.start()
        ProcessBuilder("git", "init").start()
    }

    @Test
    fun readsTheLog() {
        val server = WireMockServer(8090)
        server.start()
        ProcessBuilder("git", "log").start()
    }
}
`;

    expect(starts(text)).toEqual([
      'ProcessTest.initializesTheFirst@20',
      'ProcessTest.initializesTheFirst@21',
      'ProcessTest.initializesTheSecond@27',
      'ProcessTest.initializesTheSecond@28',
    ]);
  });

  it('reports Spring, Runtime.exec and Ktor starts in a hook', () => {
    const text = `package demo

import io.ktor.server.engine.embeddedServer
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.boot.runApplication
import org.springframework.boot.SpringApplication

class AppTest {
    @BeforeEach
    fun start() {
        runApplication<AppTest>()
        SpringApplication.run(AppTest::class.java)
        Runtime.getRuntime().exec(arrayOf("git", "status"))
        embeddedServer(Netty, port = 0) {}.start()
    }

    @Test
    fun runs() {
    }
}
`;

    expect(starts(text)).toEqual(['AppTest@12', 'AppTest@13', 'AppTest@14', 'AppTest@15']);
  });

  it('reports Kotest per-test hooks and container extensions, not spec-level ones', () => {
    const text = `${KOTEST}
class ApiSpec : FunSpec({
    val shared = GenericContainer("redis:7")
    install(ContainerExtension(shared, ContainerLifecycleMode.Test))
    listener(shared.perTest())
    install(ContainerExtension(shared))

    beforeTest {
        val server = MockWebServer()
        server.start()
        shared.start()
    }

    beforeSpec {
        MockWebServer().start()
    }

    test("calls") {
        shared.host
    }
})
`;

    expect(starts(text)).toEqual(['ApiSpec@12', 'ApiSpec@13', 'ApiSpec@18']);
  });

  it('ignores look-alikes from other libraries and members of other objects', () => {
    const text = `package demo

import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

class Engine {
    fun start() {}
}

class EngineTest {
    private val engine = Engine()

    @BeforeEach
    fun start() {
        engine.start()
        Engine().start()
        env.server.start()
    }

    @Test
    fun runs() {
        Engine().start()
    }

    @Test
    fun runsAgain() {
        Engine().start()
    }
}
`;

    expect(starts(text)).toEqual([]);
  });

  it('resolves a receiver in its own class, not a same-named property of another class', () => {
    const text = `${JUNIT}import okhttp3.mockwebserver.MockWebServer

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SharedServerTest {
    private val server = MockWebServer()

    @BeforeEach
    fun start() {
        server.start()
    }

    @Test
    fun calls() {}
}

class CompanionServerTest {
    @BeforeEach
    fun start() {
        server.start()
    }

    @Test
    fun calls() {}

    companion object {
        val server = MockWebServer()
    }
}

class FreshServerTest {
    private val server = MockWebServer()

    @BeforeEach
    fun start() {
        server.start()
    }

    @Test
    fun calls() {}
}
`;

    expect(starts(text)).toEqual(['FreshServerTest@49']);
  });

  it('reports one-line tests, fluent chains, scope functions and started properties', () => {
    const text = `${JUNIT}import okhttp3.mockwebserver.MockWebServer

class FluentTest {
    private val started = MockWebServer().apply { start() }

    @BeforeEach
    fun start() {
        GenericContainer("redis:7").withEnv("A", "b").start()
        GenericContainer("redis:7").also { it.start() }
        MockWebServer().use { it.start() }
    }

    @Test
    fun first() { MockWebServer().start() }

    @Test
    fun second() { MockWebServer().start() }
}
`;

    expect(starts(text)).toEqual([
      'FluentTest@18',
      'FluentTest@22',
      'FluentTest@23',
      'FluentTest@24',
      'FluentTest.first@28',
      'FluentTest.second@31',
    ]);
  });
});
