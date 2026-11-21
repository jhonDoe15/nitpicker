package e;

import java.lang.Thread.State;
import java.util.List;

public class Names {
    static class Box<Value, T, t, TValue, ValueT> {
        Value held;
    }

    @SuppressWarnings("unchecked")
    List<String> unexplained(Object raw) {
        return (List<String>) raw;
    }

    @SuppressWarnings("unchecked") // the caller only passes lists of strings
    List<String> explained(Object raw) {
        return (List<String>) raw;
    }

    <T> T unusedInFormals() {
        return null;
    }

    <T> T usedInFormals(List<T> from) {
        return from.get(0);
    }

    static class Builder {
        String name;

        Builder name(String name) {
            Builder copy = new Builder();
            copy.name = name;
            return copy;
        }

        Builder self() {
            return this;
        }
    }

    private static class Hidden {
        public int count;

        public void run() {}

        protected void walk() {}

        @Override
        public String toString() {
            return "hidden";
        }
    }

    java.util.List<String> qualified;
    java.util.Set<String> needed;
    Thread.State longer;
    State shorter;

    int bad_field;
    static final int notConstant = 1;

    void Bad_Method(int Param_one) {
        int local_value = Param_one;
        bad_field = local_value;
    }

    static class First {
        static class Shared {}

        Shared own;
    }

    static class Second {
        static class Shared {}

        Shared own;
    }
}
