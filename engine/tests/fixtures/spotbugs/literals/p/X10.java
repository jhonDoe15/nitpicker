package p;

import java.util.*;

public class X10 {
    private final List<String> f;
    private final List<String> other = new ArrayList<>();

    public X10(boolean c, String a, List<String> p, String[] arr) {
        f = c ? List.copyOf(p) : List.of();
    }

    public List<String> g() {
        return f;
    }
}
