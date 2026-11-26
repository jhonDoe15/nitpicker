package p;

import java.util.Map;

public class Q {
    private Map<String, String> raw;
    private Map<String, String> other;

    private Q() {
    }

    public static Q of(Map<String, String> raw) {
        Q q = new Q();
        q.raw = raw;
        return q;
    }

    public void copy() {
        other = raw;
    }
}
