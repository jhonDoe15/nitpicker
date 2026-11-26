package p;

import java.util.*;

public class X7 {
    private final List<String> f;
    private final List<String> other = new ArrayList<>();

    public X7(boolean c, String a, List<String> p, String[] arr) {
        f = c ? List.of() : List.copyOf(p);
    }

    public List<String> g() {
        return f;
    }
}
