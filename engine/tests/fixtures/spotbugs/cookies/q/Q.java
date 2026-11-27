package q;
import javax.servlet.http.*;

public class Q {
    static {
        Cookie c = new Cookie("a", "b");
        c.setSecure(true);
    }
    {
        Cookie d = new Cookie("a", "b");
        d.setHttpOnly(true);
    }
    Runnable r = () -> {
        Cookie e = new Cookie("a", "b");
        e.setSecure(true);
    };
    void m() {
        Runnable s = () -> {
            Cookie f = new Cookie("a", "b");
        };
        Object o = new Object() {
            void x() {
                Cookie g = new Cookie("a", "b");
                g.setHttpOnly(true);
            }
        };
    }
    Q() {
    }
    Q(int x) {
        this();
    }
}
