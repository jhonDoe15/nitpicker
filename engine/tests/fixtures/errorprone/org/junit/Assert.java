package org.junit;

public class Assert {
    public static void assertSame(Object expected, Object actual) {}

    public static void assertSame(String message, Object expected, Object actual) {}

    public static void fail() {}

    public static void fail(String message) {}

    public static void assertTrue(boolean condition) {}

    public static void assertTrue(String message, boolean condition) {}

    public static void assertEquals(long expected, long actual) {}
    public static void assertEquals(double expected, double actual, double delta) {}
    public static void assertEquals(float expected, float actual, float delta) {}
    public static void assertEquals(String message, double expected, double actual, double delta) {}
    public static void assertEquals(String message, float expected, float actual, float delta) {}

    public static void assertEquals(Object expected, Object actual) {}

    public static void assertEquals(String message, Object expected, Object actual) {}

    public static void assertArrayEquals(Object[] expected, Object[] actual) {}

    public static void assertNotEquals(Object unexpected, Object actual) {}

    public static void assertNotEquals(String message, Object unexpected, Object actual) {}

    public static void assertArrayEquals(String message, Object[] expected, Object[] actual) {}

    public static void assertArrayEquals(long[] expected, long[] actual) {}

    public static void assertArrayEquals(byte[] expected, byte[] actual) {}

    public static void assertArrayEquals(String message, double[] expected, double[] actual, double delta) {}

    public static <T extends Throwable> T assertThrows(Class<T> expectedThrowable, org.junit.function.ThrowingRunnable runnable) {
        return null;
    }

    public static void assertNotSame(Object unexpected, Object actual) {}

    public static void assertNotSame(String message, Object unexpected, Object actual) {}
}
