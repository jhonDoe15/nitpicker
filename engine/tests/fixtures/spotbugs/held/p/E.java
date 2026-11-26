package p;

import java.util.HashMap;
import java.util.Map;

public class E {
    private final Map<String, String> raw;
    private Map<String, String> other;

    public E(Map<String, String> raw) {
        this.raw = raw;
    }

    public E() {
        this.raw = new HashMap<>();
    }

    public void copy() {
        other = raw;
    }
}
