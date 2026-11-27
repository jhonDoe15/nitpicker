package k;
import javax.servlet.http.*;

public class K {
    void a(HttpServletResponse r) {
        Cookie c = new Cookie("a", "b");
        r.addCookie(c);
    }
    void b(HttpServletResponse r) {
        Cookie c = new Cookie("a", "b");
        c.setSecure(true);
        c.setHttpOnly(true);
        r.addCookie(c);
    }
    void c(HttpServletResponse r) {
        Cookie c = new Cookie("a", "b");
        c.setSecure(true);
        r.addCookie(c);
    }
    void d(HttpServletResponse r) {
        Cookie c = new Cookie("a", "b");
        c.setHttpOnly(true);
    }
    void e(HttpServletResponse r) {
        Cookie c = new Cookie("a", "b");
        c.setSecure(false);
        c.setHttpOnly(false);
    }
    void f(boolean x) {
        Cookie c = new Cookie("a", "b");
        c.setSecure(x);
        c.setHttpOnly(x);
    }
    void g() {
        Cookie c = new Cookie("a", "b");
        Cookie d = new Cookie("c", "d");
        c.setSecure(true);
        c.setHttpOnly(true);
    }
    void h() {
        Cookie c = new Cookie("a", "b");
        c.setMaxAge(60);
        c.setMaxAge(31536000);
        c.setMaxAge(31536001);
        c.setMaxAge(Integer.MAX_VALUE);
        c.setMaxAge(-1);
        c.setMaxAge(0);
        int big = 400000000;
        c.setMaxAge(big);
        c.setMaxAge(60 * 60 * 24 * 366);
        c.setSecure(true);
        c.setHttpOnly(true);
    }
    void i(HttpServletResponse r, String u) {
        r.encodeURL(u);
        r.encodeRedirectURL(u);
        r.encodeUrl(u);
        r.encodeRedirectUrl(u);
        HttpServletResponseWrapper w = new HttpServletResponseWrapper();
        w.encodeURL(u);
    }
    void j(HttpServletRequest q) {
        for (Cookie c : q.getCookies()) {
            c.getValue();
        }
    }
    Cookie k() {
        return new Cookie("a", "b");
    }
    void l() {
        Cookie c = new Cookie("a", "b");
        c.setSecure(true);
        c.setSecure(true);
        Cookie d = new Cookie("a", "b");
    }
    void m(Cookie given) {
        given.setSecure(true);
    }
    void n() {
        Cookie c = new Cookie("a", "b");
        c.setHttpOnly(true);
        Cookie d = new Cookie("a", "b");
        d.setSecure(true);
    }
}
