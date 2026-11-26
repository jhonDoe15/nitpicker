package p;

import java.util.Map;

public class H2 {
    private static Map<String, String> raw;
    private Map<String, String> other;

    public void init(Map<String, String> m) {
        raw = m;
    }

    public void copy() {
        other = raw;
    }
}
