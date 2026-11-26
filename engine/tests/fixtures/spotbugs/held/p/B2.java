package p;

import java.util.Map;

public class B2 {
    private Map<String, String> raw;
    private Map<String, String> other;

    public void copy() {
        other = raw;
    }

    public void set(Map<String, String> raw) {
        this.raw = raw;
    }
}
