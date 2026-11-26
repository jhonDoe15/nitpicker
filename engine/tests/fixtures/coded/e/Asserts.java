package e;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class Asserts {
    @Test
    public void checks() {
        Object a = new Object();
        Object b = new Object();
        int one = 1;
        boolean flag = one > 0;
        assertTrue(a == b);
        assertFalse(a != null);
        assertTrue(one == 2);
        assertTrue(!flag);
        assertFalse(a.equals(b));
        assertTrue(!a.equals(b));
        assertEquals(true, flag);
        assertNotEquals(false, flag);
        assertEquals(a, b);
    }
}
