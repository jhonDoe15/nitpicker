package k;
import javax.servlet.http.*;

public class P {
    static final int YEAR = 31536000;
    static int loose = 31536000;
    int field = 31536000;
    int mixed = 31536000;
    long wide = 1;
    void set() { mixed = 5; }
    void a(Cookie c, int given, boolean x) {
        c.setMaxAge(YEAR);
        c.setMaxAge(loose);
        c.setMaxAge(field);
        c.setMaxAge(mixed);
        c.setMaxAge(given);
        c.setMaxAge(x ? YEAR : 5);
        c.setMaxAge(x ? YEAR : YEAR);
        int n = 5;
        if (x) {
            n = YEAR;
        }
        c.setMaxAge(n);
        c.setMaxAge(YEAR - 1);
        c.setMaxAge((int) 31536000L);
        c.setMaxAge(Integer.valueOf(YEAR));
        c.setMaxAge(YEAR); c.setMaxAge(YEAR + 1);
        int m = YEAR;
        m++;
        c.setMaxAge(m);
        c.setMaxAge(Math.max(1, YEAR));
        c.setMaxAge('a' * 1000000);
        c.setMaxAge(
            YEAR);
    }
    void b(Mine m, HttpServletResponse r, String u) {
        m.setMaxAge(YEAR);
        m.encodeURL(u);
        Object s = r.encodeURL(u);
        java.util.function.Function<String, String> f = r::encodeURL;
        Mine2 two = null;
        two.encodeURL(u);
    }
    void loops(Cookie c, boolean x) {
        for (int i = YEAR; i < YEAR + 3; i++) {
            c.setMaxAge(i);
        }
        int q = YEAR;
        while (x) {
            q++;
        }
        c.setMaxAge(q);
        int r = YEAR;
        r--;
        r++;
        c.setMaxAge(r);
        long w = YEAR;
        w++;
        c.setMaxAge((int) w);
    }
    static class Mine extends Cookie {
        Mine() { super("a", "b"); }
        String encodeURL(String u) { return u; }
        void self() { setMaxAge(YEAR); }
    }
    interface Mine2 extends HttpServletResponse { }
}
