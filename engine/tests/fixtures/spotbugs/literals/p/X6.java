package p;

import java.util.*;

public class X6 {
    private final List<String> f;
    private final List<String> other = new ArrayList<>();

    public X6(boolean c, String a, List<String> p, String[] arr) {
        f = c ? List.of() : Collections.unmodifiableList(p);
    }

    public List<String> g() {
        return f;
    }
}
