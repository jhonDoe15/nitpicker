package k;
import javax.servlet.http.*;

public class C {
    Cookie kept;
    static class Mine extends Cookie {
        Mine() {
            super("a", "b");
        }
    }
    void a(HttpServletResponse r) {
        r.addCookie(new Cookie("a", "b"));
    }
    void b() {
        kept = new Cookie("a", "b");
    }
    Cookie c() {
        Cookie c = new Cookie("a", "b");
        return c;
    }
    void d(boolean x) {
        Cookie c = new Cookie("a", "b");
        if (x) {
            c.setSecure(true);
            c.setHttpOnly(true);
        }
    }
    void e() {
        Cookie c = new Cookie("a", "b");
        Cookie alias = c;
        alias.setSecure(true);
        alias.setHttpOnly(true);
    }
    void f() {
        Cookie c = new Cookie("a", "b");
        c = new Cookie("c", "d");
        c.setSecure(true);
        c.setHttpOnly(true);
    }
    void g() {
        Cookie c = new Mine();
        Mine m = new Mine();
    }
    void h() {
        Cookie c;
        c = new Cookie("a", "b");
    }
    void i() {
        for (int j = 0; j < 2; j++) {
            Cookie c = new Cookie("a", "b");
            c.setSecure(true);
        }
    }
    void j() {
        Cookie c = new Cookie("a", "b");
        c.setSecure(true);
        {
            Cookie d = new Cookie("a", "b");
            d.setHttpOnly(true);
        }
    }
    void k() {
        Cookie c = new Cookie("a", "b");
        helper(c);
    }
    void helper(Cookie c) {
        c.setSecure(true);
        c.setHttpOnly(true);
    }
    void l() {
        Cookie c = new Cookie("a", "b"); Cookie d = new Cookie("a", "b");
    }
    void m() {
        Cookie c = new Cookie("a", "b");
        boolean t = true;
        c.setSecure(t);
        c.setHttpOnly(Boolean.TRUE);
    }
    void n() {
        Cookie c = new Cookie("a", "b");
        c.setSecure(true);
        c.setHttpOnly(true);
        Cookie d = c;
        Runnable r = () -> new Cookie("a", "b");
    }
    void o() {
        Object o = new Cookie("a", "b");
        new Cookie("a", "b").setSecure(true);
    }
    void p() {
        Cookie c = new Cookie(
            "a",
            "b");
    }
    void q() {
        Cookie c = null;
        c.setSecure(true);
        c.setHttpOnly(true);
        Cookie d = new Cookie("a", "b");
    }
    void s() {
        Cookie c = new Cookie("a", "b");
        c.setSecure(false);
        c.setSecure(true);
        c.setHttpOnly(true);
        c.setHttpOnly(false);
    }
}
