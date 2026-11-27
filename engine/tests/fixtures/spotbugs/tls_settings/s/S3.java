package s;
import org.apache.commons.mail.*;

public class S3 {
    Email kept = new SimpleEmail();
    void a() {
        Email e = new SimpleEmail();
        e.setSSLOnConnect(true);
        e.send();
    }
    void b() {
        Email e = new SimpleEmail();
        e.setSSLOnConnect(true);
        e.setSSLCheckServerIdentity(true);
    }
    void c() {
        Email e = new HtmlEmail();
        e.setSSL(true);
    }
    void d(boolean on) {
        SimpleEmail e = new SimpleEmail();
        e.setSSLOnConnect(on);
    }
    void e() {
        Email e = new SimpleEmail();
        e.setSSLOnConnect(false);
    }
    void f() {
        Email e = new SimpleEmail();
        e.setStartTLSEnabled(true);
    }
    void g() {
        kept.setSSLOnConnect(true);
    }
    void h() {
        Email e = new SimpleEmail();
        e.setSSLCheckServerIdentity(true);
        e.setSSLOnConnect(true);
    }
    void i() {
        Email e = new SimpleEmail();
        e.setSSLOnConnect(true);
        e.setSSLCheckServerIdentity(false);
    }
    void j() {
        Email e = new SimpleEmail();
        e.setSSLOnConnect(true);
        e.setSSLOnConnect(true);
        Email f = new SimpleEmail();
        f.setSSLCheckServerIdentity(true);
    }
    void k(Email given) {
        given.setSSLOnConnect(true).setHostName("x");
    }
    void l() {
        new SimpleEmail().setSSLOnConnect(true);
    }
    void m() {
        Email e = new SimpleEmail();
        e.setSSLOnConnect(true);
        e.setTLS(true);
    }
}
