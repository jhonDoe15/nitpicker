import java.io.IOException;
import org.junit.Assert;
import org.junit.Test;

class S16CatchFail {
    static void thrower() throws IOException, java.util.concurrent.TimeoutException {}

    @Test
    public void positive() {
        try {
            System.err.println();
        } catch (Exception expected) {
            org.junit.Assert.fail();
        }
    }

    public void testFoo() {
        try {
            System.err.println();
        } catch (Exception expected) {
            Assert.fail();
        }
    }

    @Test
    public void failFail() {
        try {
            System.err.println();
        } catch (Exception expected) {
            Assert.fail();
        } catch (Throwable unexpected) {
            Assert.fail();
        }
    }

    public void testFinally() throws RuntimeException {
        try {
            if (true) throw new NoSuchMethodException();
            if (true) throw new NoSuchFieldException();
            System.err.println();
        } catch (NoSuchMethodException | NoSuchFieldException expected) {
            Assert.fail();
        } finally {
        }
    }

    public void testOtherCatch() throws Exception {
        try {
            System.err.println();
        } catch (Exception expected) {
            Assert.fail();
        } catch (Error e) {
        }
    }

    public void nonTest() {
        try {
            System.err.println();
        } catch (Exception expected) {
            Assert.fail();
        }
    }

    public void nonTestMessage() {
        try {
            System.err.println();
        } catch (Exception expected) {
            Assert.fail("oh no");
        }
    }

    @Test
    public void usesException() {
        try {
            System.err.println();
        } catch (Exception expected) {
            Assert.fail("oh no " + expected);
        }
    }

    @Test
    public void emptyTry() {
        try {
        } catch (Exception expected) {
            Assert.fail("oh no ");
        }
    }

    @Test(expected = IOException.class)
    public void expectedTest() {
        try {
            throw new IOException();
        } catch (IOException expected) {
            Assert.fail();
        }
    }

    @Test(timeout = 5)
    public void alreadyThrown() throws Exception {
        try {
            thrower();
        } catch (IOException expected) {
            Assert.fail();
        }
    }

    @Test
    public void partlyThrown() throws IOException, java.util.concurrent.TimeoutException {
        try {
            System.err.println(); if (true) throw new IOException();
        } catch (IOException | IllegalStateException expected) {
            Assert.fail("m");
        }
    }

    @Test
    public void inLambda() {
        Runnable r = () -> {
            try {
                System.err.println();
            } catch (Exception expected) {
                Assert.fail();
            }
        };
    }

    {
        try {
            System.err.println();
        } catch (Exception expected) {
            Assert.fail();
        }
    }

    @Test
    public void resources() {
        try (java.io.StringReader reader = new java.io.StringReader("")) {
            System.err.println();
        } catch (Exception expected) {
            Assert.fail();
        }
    }

    @Test
    public void notAlone() {
        try {
            System.err.println();
        } catch (Exception expected) {
            System.err.println();
            Assert.fail();
        }
    }

    @Test
    public void unqualified() {
        try {
            thrower();
        } catch (java.util.concurrent.TimeoutException expected) {
            Assert.fail();
        } catch (Exception other) {
            Assert.fail();
        }
    }

    @Test
    @SuppressWarnings("CatchFail")
    public void suppressed() {
        try {
            System.err.println();
        } catch (Exception expected) {
            Assert.fail();
        }
    }
}
