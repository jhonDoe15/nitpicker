package p;
import java.util.*;
public class Q {
    private final Map<String, Object> m;
    public Q(Map<String, Object> m) { this.m = m == null ? null : Map.copyOf(m); }
    public Map<String, Object> m() { return m; }
    public record R(String d, Map<String, String> properties) {
        public R {
            Objects.requireNonNull(d, "d");
            properties = properties == null ? Map.of() : Collections.unmodifiableMap(properties);
        }
    }
}
