package p;

import java.util.Map;

public class E2 {
    private final Map<String, String> raw;
    private Map<String, String> other;

    public E2(Map<String, String> raw) {
        this.raw = raw;
    }

    public E2() {
        this.raw = null;
    }

    public void copy() {
        other = raw;
    }
}
