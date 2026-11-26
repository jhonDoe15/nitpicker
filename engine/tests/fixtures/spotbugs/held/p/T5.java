package p;

import java.util.Map;

public class T5 {
    private final Map<String, String> raw;
    private final Map<String, String> other;

    public T5(Map<String, String> raw) {
        this.raw = raw;
        this.other = this.raw;
    }
}
