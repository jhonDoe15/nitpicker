package p;

import java.util.HashMap;
import java.util.Map;

public class F {
    private final Map<String, String> raw;
    private Map<String, String> other;

    public F(Map<String, String> raw) {
        this.raw = new HashMap<>(raw);
    }

    public void copy() {
        other = raw;
    }
}
