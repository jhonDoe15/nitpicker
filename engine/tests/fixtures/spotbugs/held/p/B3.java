package p;

import java.util.Map;
import java.util.Objects;

public class B3 {
    private final Map<String, String> raw;
    private Map<String, String> other;

    public B3(Map<String, String> raw) {
        this.raw = Objects.requireNonNull(raw);
    }

    public void copy() {
        other = raw;
    }
}
