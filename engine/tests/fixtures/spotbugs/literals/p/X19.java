package p;

import java.util.*;

public class X19 {
    private final List<String> f;
    private final List<String> other = new ArrayList<>();

    public X19(boolean c, String a, List<String> p, String[] arr) {
        f = c ? List.of() : List.of(a);
    }

    public List<String> g() {
        return f;
    }
}
