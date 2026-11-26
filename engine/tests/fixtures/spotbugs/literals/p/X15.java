package p;

import java.util.*;

public class X15 {
    private final List<String> f;
    private final List<String> other = new ArrayList<>();

    public X15(boolean c, String a, List<String> p, String[] arr) {
        f = Set.copyOf(p).isEmpty() ? List.of() : List.copyOf(p);
    }

    public List<String> g() {
        return f;
    }
}
