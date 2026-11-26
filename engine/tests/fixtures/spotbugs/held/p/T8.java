package p;

import java.util.Map;

public class T8 {
    private final Map<String, String> raw;
    private Map<String, String> other;

    public T8(Map<String, String> raw) {
        Map<String, String> local = raw;
        this.raw = local;
    }

    public void copy() {
        other = raw;
    }
}
