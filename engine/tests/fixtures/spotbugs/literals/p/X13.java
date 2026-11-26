package p;

import java.util.*;

public class X13 {
    private final List<String> f;
    private final List<String> other = new ArrayList<>();

    public X13(boolean c, String a, List<String> p, String[] arr) {
        f = c ? List.copyOf(p) : List.copyOf(other);
    }

    public List<String> g() {
        return f;
    }
}
