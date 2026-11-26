package p;

import java.util.List;
import java.util.function.Supplier;

public record Plan(String name, Kind kind, List<Kind> kinds, Kind... more) {
    public enum Kind { A, B }

    public Plan {
        Object seen = new Object() {
            @Override
            public String toString() {
                return name + kind + kinds + more.length;
            }
        };
        Supplier<Kind> first = () -> kind;
        seen.hashCode();
        first.get();
    }

    Supplier<Kind> later() {
        Kind own = kind();
        Kind[] rest = more();
        return () -> rest.length > 0 ? rest[0] : own;
    }
}
