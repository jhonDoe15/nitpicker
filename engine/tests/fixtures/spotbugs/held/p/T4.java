package p;

import java.util.HashMap;
import java.util.Map;

public class T4 {
    private final Map<String, String> raw;
    private Map<String, String> other;

    public T4(Map<String, String> raw) {
        this.raw = raw;
    }

    public T4() {
        this(new HashMap<>());
    }

    public void copy() {
        other = raw;
    }
}
