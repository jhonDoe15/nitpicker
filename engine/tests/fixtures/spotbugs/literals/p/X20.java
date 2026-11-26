package p;

import java.util.*;

public class X20 {
    private final List<String> f;
    private final List<String> other = new ArrayList<>();

    public X20(boolean c, String a, List<String> p, String[] arr) {
        f = c ? List.copyOf(p) : Collections.unmodifiableList(p);
    }

    public List<String> g() {
        return f;
    }
}
