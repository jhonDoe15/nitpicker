package p;

import java.util.Map;

public class G {
    private final Map<String, String> raw;
    private Map<String, String> other;

    public G(Map<String, String> raw) {
        this.raw = raw;
    }

    public Map<String, String> copy() {
        Map<String, String> local = raw;
        other = local;
        return other;
    }
}
