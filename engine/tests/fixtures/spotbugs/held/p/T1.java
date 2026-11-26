package p;

import java.util.HashMap;
import java.util.Map;

public class T1 {
    private Map<String, String> raw;
    private Map<String, String> other;

    public T1(Map<String, String> raw) {
        this.raw = raw;
    }

    public void reset() {
        raw = new HashMap<>();
    }

    public void copy() {
        other = raw;
    }
}
