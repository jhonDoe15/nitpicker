package e;

import java.io.Serializable;
import java.util.function.Supplier;

public class Members implements Serializable {
    private final Thread worker = null;
    private transient Thread skipped = null;
    private final Object anything = null;
    private final Runnable task = null;
    private final Inner inner = null;

    public Members() {
        setUp();
        helper();
    }

    public void setUp() {
    }

    private void helper() {
        prepare();
    }

    protected void prepare() {
    }

    private void unused(String text) {
        unused(text);
    }

    private void unused(int number) {
    }

    private void referenced() {
    }

    private void called() {
    }

    Supplier<Object> supplier() {
        called();
        return () -> {
            referenced();
            return null;
        };
    }

    Runnable runnable() {
        return this::referencedByMethod;
    }

    private void referencedByMethod() {
    }

    class Inner {
        private void innerUnused() {
        }
    }
}
