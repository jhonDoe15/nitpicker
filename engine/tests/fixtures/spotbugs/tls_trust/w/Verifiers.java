package w;
import javax.net.ssl.*;
import java.security.cert.X509Certificate;

public class Verifiers {
    static class V1 implements HostnameVerifier {
        static boolean FLAG = true;
        static final boolean CONST = true;
        boolean flag = true;
        public boolean verify(String h, SSLSession s) {
            return true;
        }
    }
    static class V10 implements HostnameVerifier {
        static boolean FLAG = true;
        static final boolean CONST = true;
        boolean flag = true;
        public boolean verify(String h, SSLSession s) {
            if (h == null) { return false; } return true;
        }
    }
    static class V11 implements HostnameVerifier {
        static boolean FLAG = true;
        static final boolean CONST = true;
        boolean flag = true;
        public boolean verify(String h, SSLSession s) {
            int x = 1; return true;
        }
    }
    static class V12 implements HostnameVerifier {
        static boolean FLAG = true;
        static final boolean CONST = true;
        boolean flag = true;
        public boolean verify(String h, SSLSession s) {
            return h == null || true;
        }
    }
    static class V13 implements HostnameVerifier {
        static boolean FLAG = true;
        static final boolean CONST = true;
        boolean flag = true;
        public boolean verify(String h, SSLSession s) {
            return !false;
        }
    }
    static class V2 implements HostnameVerifier {
        static boolean FLAG = true;
        static final boolean CONST = true;
        boolean flag = true;
        public boolean verify(String h, SSLSession s) {
            boolean b = true; return b;
        }
    }
    static class V3 implements HostnameVerifier {
        static boolean FLAG = true;
        static final boolean CONST = true;
        boolean flag = true;
        public boolean verify(String h, SSLSession s) {
            if (h == null) { return true; } return true;
        }
    }
    static class V4 implements HostnameVerifier {
        static boolean FLAG = true;
        static final boolean CONST = true;
        boolean flag = true;
        public boolean verify(String h, SSLSession s) {
            return h != null;
        }
    }
    static class V5 implements HostnameVerifier {
        static boolean FLAG = true;
        static final boolean CONST = true;
        boolean flag = true;
        public boolean verify(String h, SSLSession s) {
            System.out.println(h); return true;
        }
    }
    static class V6 implements HostnameVerifier {
        static boolean FLAG = true;
        static final boolean CONST = true;
        boolean flag = true;
        public boolean verify(String h, SSLSession s) {
            return flag;
        }
    }
    static class V7 implements HostnameVerifier {
        static boolean FLAG = true;
        static final boolean CONST = true;
        boolean flag = true;
        public boolean verify(String h, SSLSession s) {
            return FLAG;
        }
    }
    static class V8 implements HostnameVerifier {
        static boolean FLAG = true;
        static final boolean CONST = true;
        boolean flag = true;
        public boolean verify(String h, SSLSession s) {
            return CONST;
        }
    }
    static class V9 implements HostnameVerifier {
        static boolean FLAG = true;
        static final boolean CONST = true;
        boolean flag = true;
        public boolean verify(String h, SSLSession s) {
            return 1 == 1;
        }
    }
    static class X1 {
        static class TM implements TrustManager {
            public void checkServerTrusted(X509Certificate[] c, String a) {
            }
            public boolean verify(String h, SSLSession s) {
                return true;
            }
        }
        static class None {
            public void checkServerTrusted(X509Certificate[] c, String a) {
            }
            public X509Certificate[] getAcceptedIssuers() {
                return null;
            }
            public boolean verify(String h, SSLSession s) {
                return true;
            }
        }
        static class Both implements HostnameVerifier, X509TrustManager {
            public void checkClientTrusted(X509Certificate[] c, String a) {
            }
            public void checkServerTrusted(X509Certificate[] c, String a) {
            }
            public X509Certificate[] getAcceptedIssuers() {
                return null;
            }
            public boolean verify(String h, SSLSession s) {
                return true;
            }
            public boolean verify(String h) {
                return true;
            }
            public int verify(int h) {
                return 1;
            }
        }
        static abstract class Abs implements X509TrustManager {
            public abstract void checkServerTrusted(X509Certificate[] c, String a);
            public void other() {
            }
        }
        interface Def extends X509TrustManager {
            default void checkServerTrusted(X509Certificate[] c, String a) {
            }
        }
        static class Ctor implements X509TrustManager {
            Ctor() {
            }
            static {
            }
            public void checkClientTrusted(X509Certificate[] c, String a) {
                // only a comment
            }
            public void checkServerTrusted(X509Certificate[] c, String a) {
                ;
            }
            public X509Certificate[] getAcceptedIssuers() {
                return
                    null;
            }
        }
        @SuppressWarnings("x")
        static class Sup implements HostnameVerifier {
            @edu.umd.cs.findbugs.annotations.SuppressFBWarnings("WEAK_HOSTNAME_VERIFIER")
            public boolean verify(String h, SSLSession s) {
                return true;
            }
        }
    }
}
