package e;

import java.io.IOException;
import java.util.*;

public class Values {
    enum Color {
        RED,
        GREEN
    }

    void assertFalse() {
        assert false;
        assert false : "with a message";
    }

    int ordinal(Color color) {
        return color.ordinal();
    }

    int compare(Color color) {
        return color.compareTo(Color.RED);
    }

    Object voidUsed(Void nothing) {
        Object held = nothing;
        return held;
    }

    boolean primitives(int a, int b, long c, Integer boxed) {
        boolean same = Objects.equals(a, b);
        boolean mixed = Objects.equals(a, c);
        boolean kept = Objects.equals(a, boxed);
        return same || mixed || kept;
    }

    int parentheses(int a, int b) {
        int sum = (a + b);
        int kept = (a + b) * 2;
        return (sum) + kept;
    }

    void unusedException(String text) {
        try {
            Integer.parseInt(text);
        } catch (NumberFormatException e) {
            throw new IllegalStateException("not a number");
        }
        try {
            Integer.parseInt(text);
        } catch (NumberFormatException e) {
            throw new IllegalStateException("not a number", e);
        }
    }

    String[] split(String text) {
        String[] parts = text.split(",");
        for (String part : text.split(":")) {
            parts[0] = part;
        }
        return parts;
    }

    List<String> obsolete() {
        StringBuffer buffer = new StringBuffer();
        Vector<String> vector = new Vector<>();
        vector.add(buffer.toString());
        return new LinkedList<>(vector);
    }

    boolean literal(Map<String, Boolean> flags) {
        boolean on = Boolean.TRUE;
        Boolean boxed = Boolean.FALSE;
        flags.put("on", Boolean.TRUE);
        return on || boxed;
    }

    private void notThrown() throws IOException {
        literal(new HashMap<>());
    }

    void thrown() throws IOException {
        notThrown();
        throw new IOException("gone");
    }
}
