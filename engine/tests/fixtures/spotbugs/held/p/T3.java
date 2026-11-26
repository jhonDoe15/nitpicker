package p;

import java.util.Map;

public class T3 {
    private final Map<String, String> raw;
    private Map<String, String> other;

    public T3(Map<String, String> raw) {
        this.raw = raw;
    }

    public T3(Map<String, String> raw, int x) {
        this.raw = raw;
    }

    public void copy() {
        other = raw;
    }
}
