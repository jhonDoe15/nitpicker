package plain;

import java.util.function.Supplier;

public class Unchecked {
    private Object field;
    private static Object shared;

    public Unchecked() {}

    Object get() {
        return null;
    }

    int length(String text) {
        String missing = null;
        return missing.length() + text.length();
    }

    Supplier<Object> later() {
        return () -> null;
    }

    Object anonymous() {
        return new Object() {
            private Object inner;

            @Override
            public String toString() {
                Object none = null;
                return none.toString();
            }
        };
    }

    static class Nested {
        private Object value;

        Object get() {
            return null;
        }
    }

    @marks.NullMarked
    public static class Strict {
        private Object value;

        public Strict() {}

        Object get() {
            return null;
        }

        @marks.NullUnmarked
        Object loose() {
            return null;
        }
    }
}
