package x;
import javax.net.ssl.*;
import java.security.cert.X509Certificate;

public class Records {
    static final int K = 3;
    record R2(int q, String n) implements X509TrustManager {
        public void checkClientTrusted(X509Certificate[] c, String a) {
            Object s = n;
            c[0] = (X509Certificate) s;
        }
        public void checkServerTrusted(X509Certificate[] c, String a) {
            int s = this.q;
        }
        public X509Certificate[] getAcceptedIssuers() {
            return null;
        }
    }
    record R3(int q) implements HostnameVerifier {
        public boolean verify(String h, SSLSession s) {
            return q > 0;
        }
    }
    record R4(int q) implements HostnameVerifier {
        public boolean verify(String h, SSLSession s) {
            int q = 1;
            return q > 0;
        }
    }
    static class Folds implements X509TrustManager {
        public void checkClientTrusted(X509Certificate[] c, String a) {
            String s = "a" + K;
        }
        public void checkServerTrusted(X509Certificate[] c, String a) {
            String s = "a" + 'c' + 1;
        }
        public X509Certificate[] getAcceptedIssuers() {
            String s = "a" + true + 1.5 + 2L;
            return null;
        }
    }
    static class Joins implements X509TrustManager {
        public void checkClientTrusted(X509Certificate[] c, String a) {
            String s = "a" + c.length;
        }
        public void checkServerTrusted(X509Certificate[] c, String a) {
            String s = "a" + (K + 1);
        }
        public X509Certificate[] getAcceptedIssuers() {
            return null;
        }
    }
}
