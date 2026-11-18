const ISOLATION_TEST = `package demo.orders

import java.net.URL
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.Random
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class IsolationTest {
    private val fixed = Clock.fixed(Instant.parse("2024-01-01T00:00:00Z"), ZoneOffset.UTC)

    @Test
    fun readsTheRealClock() {
        assertEquals(ZoneOffset.UTC, Instant.now().atOffset(ZoneOffset.UTC).offset)
    }

    @Test
    fun readsAFixedClock() {
        assertEquals(Instant.parse("2024-01-01T00:00:00Z"), Instant.now(fixed))
    }

    @Test
    fun measuresElapsedTime() {
        val begin = Instant.now()
        val start = System.nanoTime()
        assertTrue(Duration.between(begin, Instant.now()).toMillis() >= 0)
        assertTrue(System.nanoTime() - start >= 0)
    }

    @Test
    fun drawsAnUnseededNumber() {
        assertTrue(Random().nextInt(6) in 0..5)
    }

    @Test
    fun drawsASeededNumber() {
        assertEquals(Random(42).nextInt(6), Random(42).nextInt(6))
    }

    @Test
    fun comparesARandomId() {
        assertEquals(36, UUID.randomUUID().toString().length)
    }

    @Test
    fun keepsARandomIdOutOfTheAssertion() {
        val id = UUID.randomUUID()
        assertEquals(36, id.toString().length)
    }

    private fun fetchesARemoteHost() = URL("https://api.example.com/orders").readText()

    private fun fetchesALocalStub() = URL("http://localhost:8080/orders").readText()
}
`;

export const ISOLATION_FILES = {
  'src/test/kotlin/demo/orders/IsolationTest.kt': ISOLATION_TEST,
};

export const ISOLATION_FINDINGS = [
  'NetworkInTest IsolationTest.fetchesARemoteHost',
  'RandomInTest IsolationTest.comparesARandomId',
  'RandomInTest IsolationTest.drawsAnUnseededNumber',
  'RealClockInTest IsolationTest.readsTheRealClock',
];
