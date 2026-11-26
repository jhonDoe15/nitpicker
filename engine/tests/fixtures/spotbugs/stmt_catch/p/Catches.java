package p;

import java.io.IOException;
import java.util.Map;

public class Catches {
    private final Map<String, String> values;

    public Catches(Map<String, String> values) {
        try {
            values.size();
        } catch (NullPointerException e) {
            throw new IllegalArgumentException(e);
        }
        this.values = values;
    }

    String plain(String key) {
        try {
            return values.get(key).trim();
        } catch (NullPointerException e) {
            return "";
        }
    }

    String multi(String key) {
        try {
            return values.get(key).trim();
        } catch (IllegalStateException | NullPointerException e) {
            return "";
        }
    }

    String qualified(String key) {
        try {
            return values.get(key).trim();
        } catch (java.lang.NullPointerException e) {
            return "";
        }
    }

    String other(String key) throws IOException {
        try {
            return values.get(key).trim();
        } catch (RuntimeException e) {
            throw new IOException(e);
        }
    }

    static int parse(String text) {
        try {
            return Integer.parseInt(text);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    static String nested(Object value) {
        try {
            try {
                return value.toString();
            } catch (NullPointerException e) {
                return "inner";
            }
        } catch (NullPointerException e) {
            return "outer";
        }
    }

    static class Inner {
        int length(String text) {
            try {
                return text.length();
            } catch (NullPointerException e) {
                return 0;
            }
        }
    }

    enum Kind {
        A;

        int code(String text) {
            try {
                return text.length();
            } catch (NullPointerException e) {
                return -1;
            }
        }
    }
}
