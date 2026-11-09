const ROUNDING = `package demo.orders

object Rounding {
    var cents = 1
}
`;

const GLOBAL_STATE_TEST = `package demo.orders

import java.util.Locale
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals

class GlobalStateTest {
    @Test
    fun leaksAProperty() {
        System.setProperty("orders.currency", "EUR")
        assertEquals("EUR", System.getProperty("orders.currency"))
    }

    @Test
    fun leaksTheRounding() {
        Rounding.cents = 5
        assertEquals(5, Rounding.cents)
    }
}

class RestoredStateTest {
    private val locale = Locale.getDefault()

    @Test
    fun formatsInGermany() {
        Locale.setDefault(Locale.GERMANY)
        val previous = System.getProperty("orders.region")
        System.setProperty("orders.region", "EU")
        try {
            assertEquals("EU", System.getProperty("orders.region"))
        } finally {
            if (previous == null) System.clearProperty("orders.region") else System.setProperty("orders.region", previous)
        }
    }

    @AfterTest
    fun restore() {
        Locale.setDefault(locale)
    }
}
`;

const SHARED_STATE_TEST = `package demo.orders

import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals

class SharedStateTest {
    @Test
    fun countsEveryOrder() {
        orders++
        priced.add(3L)
        assertEquals(true, orders > 0)
    }

    companion object {
        private var orders = 0
        private val priced = mutableListOf<Long>()
    }
}

class ResetStateTest {
    private val priced = mutableListOf<Long>()

    @BeforeTest
    fun startEmpty() {
        totals.clear()
    }

    @Test
    fun addsToFreshState() {
        totals.add(3L)
        priced.add(3L)
        assertEquals(listOf(3L), totals)
    }

    companion object {
        private val totals = mutableListOf<Long>()
    }
}
`;

export const GLOBAL_STATE_FILES = {
  'src/main/kotlin/demo/orders/Rounding.kt': ROUNDING,
  'src/test/kotlin/demo/orders/GlobalStateTest.kt': GLOBAL_STATE_TEST,
  'src/test/kotlin/demo/orders/SharedStateTest.kt': SHARED_STATE_TEST,
};

export const GLOBAL_STATE_FINDINGS = [
  'GlobalStateLeakInTest GlobalStateTest.leaksAProperty',
  'GlobalStateLeakInTest GlobalStateTest.leaksTheRounding',
  'SharedTestState SharedStateTest.countsEveryOrder',
  'SharedTestState SharedStateTest.countsEveryOrder',
];
