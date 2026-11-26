package p;

import java.util.Map;

public class B {
    private Map<String, String> raw;
    private Map<String, String> other;

    public void set(Map<String, String> raw) {
        this.raw = raw;
    }

    public void copy() {
        other = raw;
    }
}
