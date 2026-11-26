package p;

import java.util.*;

public class X12 {
    private final List<String> f;
    private final List<String> other = new ArrayList<>();

    public X12(boolean c, String a, List<String> p, String[] arr) {
        f = c ? List.of(a) : List.copyOf(p);
    }

    public List<String> g() {
        return f;
    }
}
