package s;
import javax.net.ssl.*;
import org.apache.http.impl.client.*;

public class S1 {
    static final String SSL = "SSL";
    String field = "SSL";
    static String loose = "SSL";
    void ctx(String given, boolean b) throws Exception {
        SSLContext.getInstance(SSL);
        SSLContext.getInstance(field);
        SSLContext.getInstance(loose);
        SSLContext.getInstance(given);
        SSLContext.getInstance(b ? "SSL" : "TLS");
        SSLContext.getInstance("Ssl");
        SSLContext.getInstance("SSL ");
        SSLContext.getInstance("S" + "SL");
        String p = "TLS";
        if (b) {
            p = "SSL";
        }
        SSLContext.getInstance(p);
        SSLContext.getInstance(
            "SSL");
        SSLContext x = SSLContext.getInstance("SSL"), y = SSLContext.getInstance("SSL");
    }
    void clients() {
        new DefaultHttpClient();
        new DefaultHttpClient(null);
        new SystemDefaultHttpClient();
        Object o = new DefaultHttpClient() { };
    }
    static class Mine extends DefaultHttpClient {
        Mine() {
        }
    }
    static class Mine2 extends DefaultHttpClient {
        Mine2() {
            super(null);
        }
    }
}
