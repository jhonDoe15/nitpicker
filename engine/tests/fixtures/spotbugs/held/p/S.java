package p;

import java.util.Map;

public class S {
    private Map<String, String> raw;
    private Map<String, String> other;

    public void set(Map<String, String> raw) {
        this.raw = raw;
    }

    public void copy() {
        other = raw;
    }

    public void again() {
        other = raw;
    }
}
