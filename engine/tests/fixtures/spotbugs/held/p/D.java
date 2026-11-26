package p;

import java.util.Map;

public class D {
    private Map<String, String> raw;
    private Map<String, String> other;

    public D(Map<String, String> raw) {
        this.raw = raw;
    }

    public void copy() {
        other = raw;
    }
}
