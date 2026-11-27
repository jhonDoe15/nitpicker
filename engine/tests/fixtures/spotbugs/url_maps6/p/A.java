package p;

import java.net.URL;
import java.util.*;

public class A {
    Object a() {
        return
            new HashSet<URL>(
                3)
            {
            };
    }

    Object b() {
        return new HashMap<URL, String>() {
            {
                put(null, "x");
            }

            int f = 3;
        };
    }

    Object c() {
        return new HashMap<URL, String>(
        ) {
            String m() {
                return "x";
            }
        };
    }
}
