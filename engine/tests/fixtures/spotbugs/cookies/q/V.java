package q;
import javax.servlet.http.*;

public class V {
    Integer boxed = 40000000;
    void wrapped() {
        Cookie c = (new Cookie("a", "b"));
        Cookie d = (Cookie) new Cookie("a", "b");
        d.setHttpOnly(true);
        Cookie e = new Cookie("a", "b");
        final boolean fb = true;
        e.setSecure(fb);
        e.setHttpOnly(true);
    }
    void ages(Cookie c) {
        c.setMaxAge(boxed);
        int x = 31536000;
        x += 5;
        c.setMaxAge(x);
        int y = 20000000;
        y *= 2;
        c.setMaxAge(y);
        int z = 40000000;
        z <<= 1;
        c.setMaxAge(z);
        int w = 40000000;
        w = w - 1;
        c.setMaxAge(w);
        int v = 40000000;
        v -= 1;
        c.setMaxAge(v);
        int big = 2147483647;
        big += 1;
        c.setMaxAge(big);
        long l = 40000000L;
        l *= 2;
        c.setMaxAge((int) l);
        int k = 40000000;
        k = k / 0 + 1;
        c.setMaxAge(k);
    }
}
