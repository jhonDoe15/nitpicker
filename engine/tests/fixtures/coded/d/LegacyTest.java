package d;

import junit.framework.TestCase;

public class LegacyTest extends TestCase {
    public void testNothing() {
        int value = 1;
        value++;
    }

    public void testChecks() {
        assertEquals(1, 1);
    }

    public void testExpected() {
        try {
            Integer.parseInt("x");
            fail("expected");
        } catch (NumberFormatException expected) {
        }
    }

    public void testThrows() {
        try {
            throw new IllegalStateException();
        } catch (IllegalStateException expected) {
        }
    }
}
