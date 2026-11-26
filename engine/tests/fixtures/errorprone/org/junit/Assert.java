package org.junit;

public class Assert {
    public static void assertSame(Object expected, Object actual) {}

    public static void assertSame(String message, Object expected, Object actual) {}

    public static void fail() {}

    public static void fail(String message) {}

    public static void assertTrue(boolean condition) {}

    public static void assertTrue(String message, boolean condition) {}

    public static void assertEquals(long expected, long actual) {}
    public static void assertEquals(Object expected, Object actual) {}

    public static void assertEquals(String message, Object expected, Object actual) {}

    public static void assertArrayEquals(Object[] expected, Object[] actual) {}

    public static void assertNotEquals(Object unexpected, Object actual) {}

    public static void assertNotEquals(String message, Object unexpected, Object actual) {}
}
