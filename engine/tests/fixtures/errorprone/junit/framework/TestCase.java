package junit.framework;

public abstract class TestCase extends Assert {

    public static void assertEquals(Object expected, Object actual) {}

    public static void assertEquals(String message, Object expected, Object actual) {}

    public static void assertEquals(double expected, double actual, double delta) {}

    public static void assertEquals(String message, double expected, double actual, double delta) {}

    public static void assertEquals(float expected, float actual, float delta) {}

    public static void assertEquals(String message, float expected, float actual, float delta) {}
}
