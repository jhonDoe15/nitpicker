package p;

import java.util.Map;

public class C {
    private final Map<String, String> raw;
    private Map<String, String> other;

    public C(Map<String, String> raw) {
        this.raw = raw;
    }

    public synchronized void copy() {
        other = raw;
    }

    public synchronized void copyThis() {
        this.other = this.raw;
    }
}
