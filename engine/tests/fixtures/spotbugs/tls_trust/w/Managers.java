package w;
import javax.net.ssl.*;
import java.security.cert.X509Certificate;
import java.security.cert.CertificateException;

public class Managers {
    static class T1 {
        static class Empty implements X509TrustManager {
            public void checkClientTrusted(X509Certificate[] c, String a) {}
            public void checkServerTrusted(X509Certificate[] c, String a) {}
            public X509Certificate[] getAcceptedIssuers() { return null; }
        }
        static class Throws implements X509TrustManager {
            public void checkClientTrusted(X509Certificate[] c, String a)
                    throws CertificateException { throw new CertificateException("x"); }
            public void checkServerTrusted(X509Certificate[] c, String a)
                    throws CertificateException { if (c == null) throw new CertificateException("x"); }
            public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
        }
        static class Partial implements X509TrustManager {
            public void checkClientTrusted(X509Certificate[] c, String a) {}
            public void checkServerTrusted(X509Certificate[] c, String a) { System.out.println(a); }
            public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
        }
        static class Ext extends X509ExtendedTrustManager {
            public void checkClientTrusted(X509Certificate[] c, String a) {}
            public void checkServerTrusted(X509Certificate[] c, String a) {}
            public void checkClientTrusted(X509Certificate[] c, String a, java.net.Socket s) {}
            public void checkServerTrusted(X509Certificate[] c, String a, java.net.Socket s) {}
            public void checkClientTrusted(X509Certificate[] c, String a, SSLEngine s) {}
            public void checkServerTrusted(X509Certificate[] c, String a, SSLEngine s) {}
            public X509Certificate[] getAcceptedIssuers() { return null; }
        }
        static class AllTrue implements HostnameVerifier {
            public boolean verify(String h, SSLSession s) { return true; }
        }
        static class Checks implements HostnameVerifier {
            public boolean verify(String h, SSLSession s) { return h.equals("a"); }
        }
        static class False implements HostnameVerifier {
            public boolean verify(String h, SSLSession s) { return false; }
        }
        void anon() {
            TrustManager[] all = new TrustManager[] { new X509TrustManager() {
                public void checkClientTrusted(X509Certificate[] c, String a) {}
                public void checkServerTrusted(X509Certificate[] c, String a) {}
                public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            } };
            HostnameVerifier v = (h, s) -> true;
            HttpsURLConnection.setDefaultHostnameVerifier(new HostnameVerifier() {
                public boolean verify(String h, SSLSession s) { return true; }
            });
        }
    }
    static class A implements X509TrustManager {
        X509TrustManager inner;
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {

        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {

        }
        public X509Certificate[] getAcceptedIssuers() {
    return null;
        }
    }
    static class B implements X509TrustManager {
        X509TrustManager inner;
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
    throw new CertificateException("x");
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
    throw new CertificateException("x");
        }
        public X509Certificate[] getAcceptedIssuers() {
    return new X509Certificate[0];
        }
    }
    static class C implements X509TrustManager {
        X509TrustManager inner;
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
    throw new CertificateException("x");
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
    if (c == null) { throw new CertificateException("x"); }
        }
        public X509Certificate[] getAcceptedIssuers() {
    return new X509Certificate[0];
        }
    }
    static class D implements X509TrustManager {
        X509TrustManager inner;
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
    inner.checkClientTrusted(c, a);
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
    inner.checkServerTrusted(c, a);
        }
        public X509Certificate[] getAcceptedIssuers() {
    return inner.getAcceptedIssuers();
        }
    }
    static class E implements X509TrustManager {
        X509TrustManager inner;
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
    return;
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
    System.out.println(a);
        }
        public X509Certificate[] getAcceptedIssuers() {
    return held;
        }
    }
    static class F implements X509TrustManager {
        X509TrustManager inner;
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
    throw new CertificateException("x");
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
    throw new CertificateException("x");
        }
        public X509Certificate[] getAcceptedIssuers() {
    return null;
        }
    }
    static class G implements X509TrustManager {
        X509TrustManager inner;
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
    throw new CertificateException("x");
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
    System.out.println(a);
        }
        public X509Certificate[] getAcceptedIssuers() {
    return new X509Certificate[0];
        }
    }
    static class H implements X509TrustManager {
        X509TrustManager inner;
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
    System.out.println(a);
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
    System.out.println(a);
        }
        public X509Certificate[] getAcceptedIssuers() {
    return new X509Certificate[0];
        }
    }
    static class I implements X509TrustManager {
        X509TrustManager inner;
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
    throw new UnsupportedOperationException();
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
    throw new UnsupportedOperationException();
        }
        public X509Certificate[] getAcceptedIssuers() {
    throw new UnsupportedOperationException();
        }
    }
    static class J implements X509TrustManager {
        X509TrustManager inner;
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
    try { inner.checkClientTrusted(c, a); } catch (CertificateException e) { }
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
    if (a.isEmpty()) return;
        }
        public X509Certificate[] getAcceptedIssuers() {
    X509Certificate[] x = new X509Certificate[0];
            return x;
        }
    }
    static class K implements X509TrustManager {
        X509TrustManager inner;
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {

        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
    throw new CertificateException("x");
        }
        public X509Certificate[] getAcceptedIssuers() {
    return new X509Certificate[] { held[0] };
        }
    }
    static class L implements X509TrustManager {
        X509TrustManager inner;
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
    int x = 1;
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
    inner = null;
        }
        public X509Certificate[] getAcceptedIssuers() {
    return new X509Certificate[0];
        }
    }
}
