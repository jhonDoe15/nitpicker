package p;

import java.net.URL;
import java.util.*;

public class B {
    void sorted(URL u) {
        TreeSet<URL> t = new TreeSet<>();
        t.add(u);
        LinkedHashMap<URL, String> lm = new LinkedHashMap<>();
        lm.put(u, "a");
        Map<URL, String> im = Map.of();
        Set<URL> copy = new HashSet<>(Arrays.asList(u));
        var inferred = new HashMap<URL, String>();
        inferred.put(u, "b");
    }

    static class Sub extends HashSet<URL> {
    }

    void sub(Sub s, URL u) {
        s.add(u);
    }

    void it(Set<URL> s) {
        for (URL u : s) {
            u.hashCode();
        }
    }
}
