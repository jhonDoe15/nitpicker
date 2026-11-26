package p;

import java.util.Map;

public class H {
    private static Map<String, String> raw;
    private Map<String, String> other;

    public static void init(Map<String, String> m) {
        raw = m;
    }

    public void copy() {
        other = raw;
    }
}
