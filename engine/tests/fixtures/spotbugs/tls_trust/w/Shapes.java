package w;
import javax.net.ssl.*;
import java.security.cert.X509Certificate;
import java.security.cert.CertificateException;

public class Shapes {
    static abstract class Abs implements javax.net.ssl.TrustManager {
    }
    static class Base implements X509TrustManager {
        public void checkClientTrusted(X509Certificate[] c, String a)
                throws java.security.cert.CertificateException { throw new IllegalStateException(); }
        public void checkServerTrusted(X509Certificate[] c, String a)
                throws java.security.cert.CertificateException { throw new IllegalStateException(); }
        public X509Certificate[] getAcceptedIssuers() { throw new IllegalStateException(); }
        public void checkServerTrusted(String only) {
        }
    }
    static class M implements X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509TrustManager inner;
        X509Certificate[] held;
        CertificateException ex;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
    throw ex;
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
    if (c == null) return;
        }
        public X509Certificate[] getAcceptedIssuers() {
    return new X509Certificate[1];
        }
    }
    static class N implements X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509TrustManager inner;
        X509Certificate[] held;
        CertificateException ex;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
    c[0] = null;
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
    String s = a + "x";
        }
        public X509Certificate[] getAcceptedIssuers() {
    int n = 0;
            return new X509Certificate[n];
        }
    }
    static class O implements X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509TrustManager inner;
        X509Certificate[] held;
        CertificateException ex;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
    Object o = new Object();
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
    synchronized (this) { }
        }
        public X509Certificate[] getAcceptedIssuers() {
    return EMPTY;
        }
    }
    static class P implements X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509TrustManager inner;
        X509Certificate[] held;
        CertificateException ex;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
    held = c;
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
    if (held == null) { held = c; }
        }
        public X509Certificate[] getAcceptedIssuers() {
    held = null;
            return null;
        }
    }
    static class Q implements X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509TrustManager inner;
        X509Certificate[] held;
        CertificateException ex;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
    long t = System.nanoTime();
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
    assert a != null;
        }
        public X509Certificate[] getAcceptedIssuers() {
    System.out.println();
            return null;
        }
    }
    static class R extends Base {
        static final X509Certificate[] EMPTY = {};
        X509TrustManager inner;
        X509Certificate[] held;
        CertificateException ex;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {

        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {

        }
        public X509Certificate[] getAcceptedIssuers() {
    return null;
        }
    }
    static class S implements Sub {
        static final X509Certificate[] EMPTY = {};
        X509TrustManager inner;
        X509Certificate[] held;
        CertificateException ex;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {

        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {

        }
        public X509Certificate[] getAcceptedIssuers() {
    return null;
        }
    }
    interface Sub extends javax.net.ssl.X509TrustManager {
    }
    static class U implements X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509TrustManager inner;
        X509Certificate[] held;
        CertificateException ex;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {

        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {

        }
        public X509Certificate[] getAcceptedIssuers() {
    return null;
        }
    }
    static class V extends Abs {
        static final X509Certificate[] EMPTY = {};
        X509TrustManager inner;
        X509Certificate[] held;
        CertificateException ex;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {

        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {

        }
        public X509Certificate[] getAcceptedIssuers() {
    return null;
        }
    }
}
