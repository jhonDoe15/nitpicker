package p;

import java.util.*;

public class X3 {
    private final List<String> f;
    private final List<String> other = new ArrayList<>();

    public X3(boolean c, String a, List<String> p, String[] arr) {
        f = Collections.unmodifiableList(p);
    }

    public List<String> g() {
        return f;
    }
}
