package s2;
import org.apache.commons.mail.*;
public class E {
    void a(SimpleEmail e) { e.setSSLOnConnect(true); }
    void b(MultiPartEmail e) { e.setSSLOnConnect(true); }
    void c(HtmlEmail e) { e.setSSLOnConnect(true); }
    void d(ImageHtmlEmail e) { e.setSSLOnConnect(true); }
    void f(Email e) { e.setSSLOnConnect(true); }
    void g(HtmlEmail e) { e.setSSLOnConnect(true); e.setSSLCheckServerIdentity(true); }
    void h(Email e, HtmlEmail x) { e.setSSLOnConnect(true); x.setSSLCheckServerIdentity(true); }
    void i(Email e, SimpleEmail x) { e.setSSLOnConnect(true); x.setSSLCheckServerIdentity(true); }
    void j(Email e) { final boolean t = true; e.setSSLOnConnect(t); }
}
class Folded {
    void a(org.apache.commons.mail.Email e) {
        e.setSSLOnConnect(false ? false : true);
        e.setSSLOnConnect(true ? true : false);
        e.setSSLOnConnect(true ? false : true);
    }
}
