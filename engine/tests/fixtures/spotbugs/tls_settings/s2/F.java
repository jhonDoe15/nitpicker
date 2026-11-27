package s2;
import org.apache.commons.mail.*;
public class F {
    static class Mine extends Email { }
    static class Mine2 extends HtmlEmail { }
    void a(Mine e) { e.setSSLOnConnect(true); }
    void b(Mine2 e) { e.setSSLOnConnect(true); }
    void c(MultiPartEmail e, ImageHtmlEmail x) { e.setSSLOnConnect(true); x.setSSLCheckServerIdentity(true); }
    void d(HtmlEmail e, Email x) { e.setSSLOnConnect(true); x.setSSLCheckServerIdentity(true); }
    void f(Email e, Email x) { e.setSSLOnConnect(true); x.setSSLCheckServerIdentity(true); }
    void g(HtmlEmail e, MultiPartEmail x) { x.setSSLCheckServerIdentity(true); e.setSSLOnConnect(true); }
}
