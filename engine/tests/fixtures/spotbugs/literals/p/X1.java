package p;

import java.util.*;

public class X1 {
    private final List<String> f;
    private final List<String> other = new ArrayList<>();

    public X1(boolean c, String a, List<String> p, String[] arr) {
        f = List.copyOf(other);
    }

    public List<String> g() {
        return f;
    }
}
