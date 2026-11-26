package p;

import java.util.*;

public class X2 {
    private final List<String> f;
    private final List<String> other = new ArrayList<>();

    public X2(boolean c, String a, List<String> p, String[] arr) {
        f = List.copyOf(p);
    }

    public List<String> g() {
        return f;
    }
}
