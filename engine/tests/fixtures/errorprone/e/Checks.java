package e;

import java.util.Date;
import java.util.List;
import java.util.Locale;

public class Checks implements Comparable<Checks> {
    static int counter;
    static final int LIMIT = 3;
    private final String name;

    Checks(String name) {
        this.name = name;
    }

    public int compareTo(Checks other) {
        return name.compareTo(other.name);
    }

    public String toString() {
        return name;
    }

    boolean precedence(boolean a, boolean b, boolean c, int x, int y) {
        boolean mixed = a || b && c;
        int shifted = x + y << 2;
        return mixed && (a || b) && shifted > 0;
    }

    boolean references(String left, String right, Checks one, Checks two, Kind kind, Integer boxed, Leaf leaf, Leaf other) {
        boolean strings = left == right;
        boolean own = one != two;
        boolean enums = kind == Kind.A;
        boolean nulls = left == null;
        boolean boxes = boxed == other.count;
        return strings && own && enums && nulls && boxes && leaf == other;
    }

    @Override
    public boolean equals(Object other) {
        return this == other;
    }

    @Override
    public int hashCode() {
        return 1;
    }

    void braces(List<String> items) {
        if (items.isEmpty()) return;
        for (String item : items) System.out.println(item);
        while (counter < LIMIT) counter++;
        if (counter > 0) {
            counter--;
        } else counter++;
        do counter++; while (counter < 2);
    }

    void catches() {
        try {
            counter++;
        } catch (IllegalStateException expected) {
        }
        try {
            counter++;
        } catch (RuntimeException ignored) {
            // nothing to do
        }
    }

    void thrown(boolean bad) throws Exception {
        if (bad) {
            throw new RuntimeException("bad");
        }
        if (counter > 5) {
            throw new Exception("worse");
        }
        throw new IllegalStateException(new Error("x"));
    }

    void output(String text) {
        System.out.println(text.toLowerCase());
        System.err.print(text.toUpperCase(Locale.ROOT));
        Thread.dumpStack();
        Date now = new Date();
        java.util.Date then = new java.util.Date(0);
        System.out.println(now.before(then));
    }

    @SuppressWarnings("SystemOut")
    void quiet(String text) {
        System.out.println(text.toUpperCase());
    }

    enum Kind {
        A,
        B
    }

    static final class Leaf {
        Integer count;
    }
}
