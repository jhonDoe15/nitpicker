package w;
import java.security.cert.X509Certificate;
import java.security.cert.CertificateException;

public class Bodies {
    static class W1 implements javax.net.ssl.X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
            Object o = held;
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
            throw new CertificateException();
        }
        public X509Certificate[] getAcceptedIssuers() {
            throw new IllegalStateException();
        }
    }
    static class W10 implements javax.net.ssl.X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
            Class<?> k = String.class;
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
            throw new CertificateException();
        }
        public X509Certificate[] getAcceptedIssuers() {
            throw new IllegalStateException();
        }
    }
    static class W11 implements javax.net.ssl.X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
            Runnable r = () -> { };
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
            throw new CertificateException();
        }
        public X509Certificate[] getAcceptedIssuers() {
            throw new IllegalStateException();
        }
    }
    static class W12 implements javax.net.ssl.X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
            int x = c.length + 1; x *= 3; x = x % 7;
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
            throw new CertificateException();
        }
        public X509Certificate[] getAcceptedIssuers() {
            throw new IllegalStateException();
        }
    }
    static class W13 implements javax.net.ssl.X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
            for (X509Certificate x : c) { }
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
            throw new CertificateException();
        }
        public X509Certificate[] getAcceptedIssuers() {
            throw new IllegalStateException();
        }
    }
    static class W14 implements javax.net.ssl.X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
            for (int j = 0; j < 3; j++) { }
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
            throw new CertificateException();
        }
        public X509Certificate[] getAcceptedIssuers() {
            throw new IllegalStateException();
        }
    }
    static class W15 implements javax.net.ssl.X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
            switch (c.length) { case 1: return; default: break; }
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
            throw new CertificateException();
        }
        public X509Certificate[] getAcceptedIssuers() {
            throw new IllegalStateException();
        }
    }
    static class W16 implements javax.net.ssl.X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
            Object o = this;
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
            throw new CertificateException();
        }
        public X509Certificate[] getAcceptedIssuers() {
            throw new IllegalStateException();
        }
    }
    static class W17 implements javax.net.ssl.X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
            if (a == null) { return; } else { return; }
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
            throw new CertificateException();
        }
        public X509Certificate[] getAcceptedIssuers() {
            throw new IllegalStateException();
        }
    }
    static class W2 implements javax.net.ssl.X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
            CertificateException e = null; throw e;
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
            throw new CertificateException();
        }
        public X509Certificate[] getAcceptedIssuers() {
            throw new IllegalStateException();
        }
    }
    static class W3 implements javax.net.ssl.X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
            int n = c.length;
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
            throw new CertificateException();
        }
        public X509Certificate[] getAcceptedIssuers() {
            throw new IllegalStateException();
        }
    }
    static class W4 implements javax.net.ssl.X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
            Object o = (String) (Object) a;
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
            throw new CertificateException();
        }
        public X509Certificate[] getAcceptedIssuers() {
            throw new IllegalStateException();
        }
    }
    static class W5 implements javax.net.ssl.X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
            boolean b = a instanceof String;
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
            throw new CertificateException();
        }
        public X509Certificate[] getAcceptedIssuers() {
            throw new IllegalStateException();
        }
    }
    static class W6 implements javax.net.ssl.X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
            int x = a == null ? 0 : 1; c[x] = null;
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
            throw new CertificateException();
        }
        public X509Certificate[] getAcceptedIssuers() {
            throw new IllegalStateException();
        }
    }
    static class W7 implements javax.net.ssl.X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
            Object o = c[0];
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
            throw new CertificateException();
        }
        public X509Certificate[] getAcceptedIssuers() {
            throw new IllegalStateException();
        }
    }
    static class W8 implements javax.net.ssl.X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
            X509Certificate[][] m = new X509Certificate[1][1];
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
            throw new CertificateException();
        }
        public X509Certificate[] getAcceptedIssuers() {
            throw new IllegalStateException();
        }
    }
    static class W9 implements javax.net.ssl.X509TrustManager {
        static final X509Certificate[] EMPTY = {};
        X509Certificate[] held;
        public void checkClientTrusted(X509Certificate[] c, String a) throws CertificateException {
            Object o = EMPTY;
        }
        public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException {
            throw new CertificateException();
        }
        public X509Certificate[] getAcceptedIssuers() {
            throw new IllegalStateException();
        }
    }
}
