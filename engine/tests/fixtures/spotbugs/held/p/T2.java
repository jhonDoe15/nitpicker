package p;

import java.util.Map;

public class T2 {
    public void copy() {
        other = raw;
    }

    private final Map<String, String> raw;
    private Map<String, String> other;

    public T2(Map<String, String> raw) {
        this.raw = raw;
    }
}
