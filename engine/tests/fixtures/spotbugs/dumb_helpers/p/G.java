package p;

import com.google.common.base.Preconditions;

public class G {
    static final String K = "k";
    Object o = new Object();
    String s = String.valueOf(o);
    boolean b = s.isEmpty();
    int i = s.length();

    void cnn1() {
        Preconditions.checkNotNull("message", o);
    }

    void cnn2() {
        Preconditions.checkNotNull(o, "message");
    }

    void cnn3() {
        Preconditions.checkNotNull("message");
    }

    void cnn4() {
        Preconditions.checkNotNull("a", "b");
    }

    void cnn5() {
        Preconditions.checkNotNull(s, o);
    }

    void cnn6() {
        Preconditions.checkNotNull("m %s", "x", o);
    }

    void cnn7() {
        Preconditions.checkNotNull(o, "m %s", o);
    }

    void cnn8() {
        String m = "msg"; Preconditions.checkNotNull(m, o);
    }

    void cnn9() {
        Preconditions.checkNotNull(K, o);
    }

    void ca1() {
        Preconditions.checkArgument(b, "x");
    }

    void ca2() {
        Preconditions.checkState(b, "x");
    }

    void ce() {
        Preconditions.checkElementIndex(1, 2, "x");
    }

    void onn() {
        java.util.Objects.requireNonNull("message", "x");
    }

    void onn2() {
        java.util.Objects.requireNonNull("message");
    }

    void onn3() {
        java.util.Objects.requireNonNull(o, "message");
    }

    void onn4() {
        java.util.Objects.requireNonNull("message", s);
    }

    void ja1() {
        org.junit.Assert.assertNotNull(s, "message");
    }

    void ja2() {
        org.junit.Assert.assertNotNull("message", o);
    }

    void ja3() {
        org.junit.Assert.assertNotNull("message");
    }

    void ja4() {
        org.junit.Assert.assertNull("message");
    }

    void ja5() {
        org.junit.Assert.assertEquals("message", o);
    }

    void ja6() {
        org.junit.Assert.assertEquals(o, "message");
    }

    void ja7() {
        org.junit.Assert.assertEquals("m", 1, i);
    }

    void ja8() {
        org.junit.Assert.assertEquals(i, 1);
    }

    void ja9() {
        org.junit.Assert.assertEquals("m", o, "x");
    }

    void ja10() {
        org.junit.Assert.assertTrue("message", b);
    }

    void ja11() {
        org.junit.Assert.assertSame("message", o);
    }

    void ja12() {
        org.junit.Assert.assertNotNull(s);
    }

    void ja13() {
        junit.framework.Assert.assertNotNull("message");
    }

    void ja14() {
        junit.framework.Assert.assertNotNull(s, "message");
    }

    void jj1() {
        org.junit.jupiter.api.Assertions.assertNotNull("message", s);
    }

    void jj2() {
        org.junit.jupiter.api.Assertions.assertNotNull(o, "message");
    }

    void jj3() {
        org.junit.jupiter.api.Assertions.assertNotNull("message");
    }

    void jj4() {
        org.junit.jupiter.api.Assertions.assertEquals(1, i);
    }

    void jj5() {
        org.junit.jupiter.api.Assertions.assertEquals(i, 1);
    }

    void jj6() {
        org.junit.jupiter.api.Assertions.assertEquals("x", s);
    }

    void jj7() {
        org.junit.jupiter.api.Assertions.assertEquals(s, "x");
    }

    void ja15() {
        org.junit.Assert.assertEquals(s, "x");
    }

    void ja16() {
        org.junit.Assert.assertEquals("x", s);
    }

    void ja17() {
        org.junit.Assert.assertEquals(i, 1L);
    }

    void ja18() {
        org.junit.Assert.assertEquals(1L, i);
    }

    void ja19() {
        org.junit.Assert.assertEquals("m", s, "x");
    }

    void ja20() {
        org.junit.Assert.assertNull("message", o);
    }

    void gv() {
        com.google.common.base.Verify.verifyNotNull("x");
    }

}
