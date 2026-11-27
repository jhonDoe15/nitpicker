package p;

import static com.google.common.base.Preconditions.checkNotNull;
import static org.junit.Assert.assertNotNull;

public class G2 extends junit.framework.TestCase {
    Object o = new Object();
    String s = String.valueOf(o);

    void si1() {
        checkNotNull("message", o);
    }

    void si2() {
        assertNotNull("message");
    }

    void tc1() {
        junit.framework.TestCase.assertNotNull("message");
    }

    void tc2() {
        junit.framework.Assert.assertNotNull("message");
    }

    void box() {
        checkNotNull("a", 1);
    }

    void both() {
        org.junit.Assert.assertNotNull("x", "y");
    }

    void nul() {
        checkNotNull(null);
    }

    void cls() {
        checkNotNull(String.class);
    }

    void num() {
        checkNotNull(1);
    }

    void fld() {
        checkNotNull(K2);
    }

    void loc() {
        Object x = "m";
        checkNotNull(x);
    }

    void lam() {
        Runnable r = () -> checkNotNull("m");
    }

    void two() {
        checkNotNull("m");
        checkNotNull("n");
        checkNotNull("m", o);
        checkNotNull("n", o);
    }

    void assertsOwn() {
        org.junit.Assert.assertNotNull(s, "x");
        org.junit.Assert.assertNotNull("y");
    }

    void wrongJ() {
        org.junit.Assert.assertNotNull(s, "x");
    }

    static final String K2 = "k";

    static class Sub extends G2 {
        void sub() {
            assertNotNull("message");
        }
    }
}
