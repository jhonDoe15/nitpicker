package p;

import java.util.*;

public class X16 {
    private final List<String> f;
    private final List<String> other = new ArrayList<>();

    public X16(boolean c, String a, List<String> p, String[] arr) {
        f = c ? List.of() : Collections.unmodifiableList(Arrays.asList(arr));
    }

    public List<String> g() {
        return f;
    }
}
