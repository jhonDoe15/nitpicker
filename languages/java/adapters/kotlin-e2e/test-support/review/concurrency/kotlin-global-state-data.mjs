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

export const GLOBAL_STATE_FILES = {
  'src/main/kotlin/demo/orders/Rounding.kt': ROUNDING,
  'src/test/kotlin/demo/orders/GlobalStateTest.kt': GLOBAL_STATE_TEST,
};

export const GLOBAL_STATE_FINDINGS = [
  'GlobalStateLeakInTest GlobalStateTest.leaksAProperty',
  'GlobalStateLeakInTest GlobalStateTest.leaksTheRounding',
];
