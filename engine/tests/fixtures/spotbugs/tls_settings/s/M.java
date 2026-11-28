package s;
import org.apache.commons.mail.*;
import javax.naming.directory.*;
import javax.net.ssl.*;

public class M {
    static void keep(Object o) {
    }
    static final boolean ON = true;
    boolean flag = true;
    void a() {
        SimpleEmail e = new SimpleEmail();
        e.setSSLOnConnect(true);
    }
    void b() {
        Email e = new SimpleEmail();
        e.setSSLOnConnect(true);
        e.setSSLOnConnect(true);
    }
    void c() {
        Email e = new SimpleEmail();
        boolean t = true;
        e.setSSLOnConnect(t);
    }
    void d() {
        Email e = new SimpleEmail();
        e.setSSLOnConnect(ON);
    }
    void e() {
        Email e = new SimpleEmail();
        e.setSSLOnConnect(flag);
    }
    void f() {
        Email e = new SimpleEmail();
        e.setSSLOnConnect(true);
        boolean t = true;
        e.setSSLCheckServerIdentity(t);
    }
    void g() {
        Email e = new SimpleEmail();
        e.setSSLOnConnect(true);
        e.setSSLCheckServerIdentity(ON);
    }
    void h(boolean x) {
        Email e = new SimpleEmail();
        if (x) {
            e.setSSLOnConnect(true);
        } else {
            e.setSSLCheckServerIdentity(true);
        }
    }
    void i() {
        Email e = new SimpleEmail();
        e.setSSLOnConnect(true);
        Runnable r = () -> e.setSSLCheckServerIdentity(true);
    }
    void j() {
        Email e = new SimpleEmail();
        Runnable r = () -> e.setSSLOnConnect(true);
    }
    void k() {
        ((Email) new HtmlEmail()).setSSLOnConnect(true);
        Email e = new SimpleEmail();
        e
            .setSSLOnConnect(true);
    }
    void l() {
        Email e = new SimpleEmail();
        e.setSSLOnConnect(1 == 1);
        boolean t = false;
        t = true;
        e.setSSLOnConnect(t);
    }
    void m(boolean y) {
        Email e = new SimpleEmail();
        boolean t = y;
        e.setSSLOnConnect(t);
        e.setSSLCheckServerIdentity(y);
    }
    void s1(boolean x) {
        SearchControls s = new SearchControls();
        s.setReturningObjFlag(ON);
        s.setReturningObjFlag(flag);
        boolean t = false;
        if (x) { t = true; }
        s.setReturningObjFlag(t);
        s.setReturningObjFlag(!false);
        s.setReturningObjFlag(true); s.setReturningObjFlag(true);
        keep(new SearchControls(1, 0, 0, null, ON, false));
        keep(new SearchControls(1, 0, 0, null,
            true,
            false));
    }
    static class Sub extends SearchControls {
        Sub() {
            super(1, 0, 0, null, true, false);
        }
        void m() {
            setReturningObjFlag(true);
        }
    }
    void s2() {
        Sub s = new Sub();
        s.setReturningObjFlag(true);
    }
    void ssl() throws Exception {
        String p = "SSL";
        p = "TLS";
        SSLContext.getInstance(p);
        String q = "TLS";
        q = "SSL";
        SSLContext.getInstance(q);
        SSLContext.getInstance(flag ? "SSL" : "SSL");
        SSLContext.getInstance("SSLv2");
        SSLContext.getInstance(String.valueOf("SSL"));
        SSLContext.getInstance("ssl".toUpperCase());
    }
}
