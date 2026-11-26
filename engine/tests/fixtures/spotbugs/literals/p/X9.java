package p;

import java.util.*;

public class X9 {
    private final List<String> f;
    private final List<String> other = new ArrayList<>();

    public X9(boolean c, String a, List<String> p, String[] arr) {
        f = c ? Collections.emptyList() : Collections.unmodifiableList(p);
    }

    public List<String> g() {
        return f;
    }
}
