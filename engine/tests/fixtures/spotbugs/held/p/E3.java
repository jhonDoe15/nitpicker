package p;

import java.util.Map;

public class E3 {
    private final Map<String, String> raw;
    private Map<String, String> other;

    public E3(Map<String, String> raw) {
        this.raw = raw;
    }

    public E3() {
        this.raw = Map.of();
    }

    public void copy() {
        other = raw;
    }
}
