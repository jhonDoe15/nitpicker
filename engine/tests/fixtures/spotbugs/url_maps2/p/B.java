package p;

import java.net.URI;
import java.net.URL;
import java.util.*;

public class B {
    boolean calls(URL a, Object o, URI uri, Sub s) {
        boolean x = a.equals(o);
        int y = a.hashCode();
        boolean z = uri.equals(o);
        boolean w = s.equals(o);
        int v = s.hashCode();
        boolean q = ((Object) a).equals(o);
        boolean r = Objects.equals(a, o);
        return x && z && w && q && r && y + v > 0;
    }

    static class Sub {
        URL url;

        public boolean equals(Object o) {
            return url.equals(o);
        }

        public int hashCode() {
            return url.hashCode();
        }
    }

    boolean twice(URL a, URL b) {
        return a.equals(b) && b.equals(a) && a.hashCode() == b.hashCode();
    }

    void anon(URL u) {
        new Object() {
            int h = u.hashCode();
        };
        Runnable r = () -> u.hashCode();
        r.run();
    }
}
