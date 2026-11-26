package p;

import java.util.*;

public class X5 {
    private final List<String> f;
    private final List<String> other = new ArrayList<>();

    public X5(boolean c, String a, List<String> p, String[] arr) {
        f = Collections.unmodifiableList(Arrays.asList(arr));
    }

    public List<String> g() {
        return f;
    }
}
