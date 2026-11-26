package p;

import java.util.Map;

public class T7 {
    private final Map<String, String> raw;
    private Map<String, String> other;

    public T7(Map<String, String> raw, boolean c) {
        this.raw = c ? raw : null;
    }

    public void copy() {
        other = raw;
    }
}
