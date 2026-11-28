package p;

import java.util.*;

public class X11 {
    private final List<String> f;
    private final List<String> other = new ArrayList<>();

    public X11(boolean c, String a, List<String> p, String[] arr) {
        f = c ? Collections.unmodifiableList(p) : List.of();
    }

    public List<String> g() {
        return f;
    }
}
