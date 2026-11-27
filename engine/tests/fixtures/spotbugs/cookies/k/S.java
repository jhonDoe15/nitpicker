package k;
import javax.servlet.http.*;

public class S {
    void a() {
        {
            Cookie c = new Cookie("a", "b");
            c.setSecure(true);
            c.setHttpOnly(true);
        }
        {
            Cookie d = new Cookie("a", "b");
        }
    }
    void b(boolean x) {
        if (x) {
            Cookie c = new Cookie("a", "b");
        } else {
            Cookie d = new Cookie("a", "b");
            d.setSecure(true);
        }
    }
    void c() {
        for (int i = 0; i < 2; i++) {
            Cookie c = new Cookie("a", "b");
        }
        Cookie d = new Cookie("a", "b");
        d.setSecure(true);
        d.setHttpOnly(true);
    }
    void d() {
        {
            int n = 1;
        }
        Cookie c = new Cookie("a", "b");
        c.setSecure(true);
        {
            long l = 2;
            Cookie d = new Cookie("a", "b");
        }
    }
}
