package p;

import java.util.*;

public class X8 {
    private final List<String> f;
    private final List<String> other = new ArrayList<>();

    public X8(boolean c, String a, List<String> p, String[] arr) {
        f = c ? Collections.emptyList() : List.copyOf(p);
    }

    public List<String> g() {
        return f;
    }
}
