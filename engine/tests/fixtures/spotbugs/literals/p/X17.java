package p;

import java.util.*;

public class X17 {
    private final List<String> f;
    private final List<String> other = new ArrayList<>();

    public X17(boolean c, String a, List<String> p, String[] arr) {
        f = c ? List.of() : new ArrayList<>(p);
    }

    public List<String> g() {
        return f;
    }
}
