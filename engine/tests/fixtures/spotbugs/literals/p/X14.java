package p;

import java.util.*;

public class X14 {
    private final List<String> f;
    private final List<String> other = new ArrayList<>();

    public X14(boolean c, String a, List<String> p, String[] arr) {
        f = c ? Collections.unmodifiableList(p) : Collections.unmodifiableList(other);
    }

    public List<String> g() {
        return f;
    }
}
