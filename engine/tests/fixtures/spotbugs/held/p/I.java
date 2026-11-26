package p;

import java.util.Map;

public class I {
    private final Map<String, String> raw;
    private Map<String, String> other;

    public I(Map<String, String> raw) {
        this.raw = raw;
    }

    public void copy(I that) {
        other = that.raw;
    }
}
