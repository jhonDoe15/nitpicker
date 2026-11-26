package p;

import java.util.Map;

class K {
    private final Map<String, String> raw;
    private Map<String, String> other;

    public K(Map<String, String> raw) {
        this.raw = raw;
    }

    public void copy() {
        other = raw;
    }
}
