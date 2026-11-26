package p;

import java.util.Map;

public class T6 {
    private final Map<String, String> raw;
    private Map<String, String> other;
    private static Map<String, String> shared;

    public T6(Map<String, String> raw) {
        this.raw = raw;
    }

    public void copy() {
        shared = raw;
    }

    public Map<String, String> get() {
        return raw;
    }
}
