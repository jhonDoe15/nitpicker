package p;

import java.io.File;
import java.util.function.Function;
import javax.servlet.http.HttpServletRequest;

public class A {
    Function<String, File> f1 = x -> { String s = "a"; return new File(s); };
    Function<String, File> f2 = x -> { return new File(x); };
    Function<String, File> f3 = x -> new File(x + "");
    static String u0 = System.getenv("u");
    String u1;

    {
        { int i = 0; }
        String u = System.getenv("x");
        new File(u);
    }

    {
        String k = "k";
        { new File(k); }
        new File(u1);
    }

    static {
        { int j = 1; }
        new File(System.getenv("y"));
    }

    static String a(String x, boolean c) {
        if (c) {
            return x;
        }
        return b(x, c);
    }

    static String b(String x, boolean c) {
        return a(x, c);
    }

    void t1(HttpServletRequest r) {
        new File(a(r.getParameter("p"), true));
    }

    void t2(HttpServletRequest r) {
        new File(b(r.getParameter("p"), true));
    }

    void t3(String q) {
        new File(b(q, true));
    }

    void t4() {
        new File(b("s", true));
    }
}
