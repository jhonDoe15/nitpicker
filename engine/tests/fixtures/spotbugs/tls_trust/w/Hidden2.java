package w;
import javax.net.ssl.*;

public class Hidden2 {
    static class U11 {
        enum E { A, B }
        final boolean konst = true;
        boolean flag;
        static E e = E.A;
        Object verifier(String cap, int n) {
            return new HostnameVerifier() {
                public boolean verify(String h, SSLSession s) {
                    h += "x"; return true;
                }
            };
        }
        class In implements HostnameVerifier {
            public boolean verify(String h, SSLSession s) {
                h += "x"; return true;
            }
        }
    }
    static class U12 {
        enum E { A, B }
        final boolean konst = true;
        boolean flag;
        static E e = E.A;
        Object verifier(String cap, int n) {
            return new HostnameVerifier() {
                public boolean verify(String h, SSLSession s) {
                    for (String x : new String[] { h }) { } return true;
                }
            };
        }
        class In implements HostnameVerifier {
            public boolean verify(String h, SSLSession s) {
                for (String x : new String[] { h }) { } return true;
            }
        }
    }
    static class U13 {
        enum E { A, B }
        final boolean konst = true;
        boolean flag;
        static E e = E.A;
        Object verifier(String cap, int n) {
            return new HostnameVerifier() {
                public boolean verify(String h, SSLSession s) {
                    for (Object x : java.util.List.of()) { } return true;
                }
            };
        }
        class In implements HostnameVerifier {
            public boolean verify(String h, SSLSession s) {
                for (Object x : java.util.List.of()) { } return true;
            }
        }
    }
    static class U14 {
        enum E { A, B }
        final boolean konst = true;
        boolean flag;
        static E e = E.A;
        Object verifier(String cap, int n) {
            return new HostnameVerifier() {
                public boolean verify(String h, SSLSession s) {
                    return n > 0;
                }
            };
        }
    }
    static class U15 {
        enum E { A, B }
        final boolean konst = true;
        boolean flag;
        static E e = E.A;
        Object verifier(String cap, int n) {
            return new HostnameVerifier() {
                public boolean verify(String h, SSLSession s) {
                    return U15.this == null;
                }
            };
        }
        class In implements HostnameVerifier {
            public boolean verify(String h, SSLSession s) {
                return U15.this == null;
            }
        }
    }
    static class U16 {
        enum E { A, B }
        final boolean konst = true;
        boolean flag;
        static E e = E.A;
        Object verifier(String cap, int n) {
            return new HostnameVerifier() {
                public boolean verify(String h, SSLSession s) {
                    synchronized (this) { } return true;
                }
            };
        }
        class In implements HostnameVerifier {
            public boolean verify(String h, SSLSession s) {
                synchronized (this) { } return true;
            }
        }
    }
    static class U17 {
        enum E { A, B }
        final boolean konst = true;
        boolean flag;
        static E e = E.A;
        Object verifier(String cap, int n) {
            return new HostnameVerifier() {
                public boolean verify(String h, SSLSession s) {
                    Object o = this; return o != null;
                }
            };
        }
        class In implements HostnameVerifier {
            public boolean verify(String h, SSLSession s) {
                Object o = this; return o != null;
            }
        }
    }
    static class U18 {
        enum E { A, B }
        final boolean konst = true;
        boolean flag;
        static E e = E.A;
        Object verifier(String cap, int n) {
            return new HostnameVerifier() {
                public boolean verify(String h, SSLSession s) {
                    Object o = e; return o != null;
                }
            };
        }
        class In implements HostnameVerifier {
            public boolean verify(String h, SSLSession s) {
                Object o = e; return o != null;
            }
        }
    }
    static class U19 {
        enum E { A, B }
        final boolean konst = true;
        boolean flag;
        static E e = E.A;
        Object verifier(String cap, int n) {
            return new HostnameVerifier() {
                public boolean verify(String h, SSLSession s) {
                    Object o = int.class; return o != null;
                }
            };
        }
        class In implements HostnameVerifier {
            public boolean verify(String h, SSLSession s) {
                Object o = int.class; return o != null;
            }
        }
    }
    static class U20 {
        enum E { A, B }
        final boolean konst = true;
        boolean flag;
        static E e = E.A;
        Object verifier(String cap, int n) {
            return new HostnameVerifier() {
                public boolean verify(String h, SSLSession s) {
                    Object o = (Runnable) null; return o != null;
                }
            };
        }
        class In implements HostnameVerifier {
            public boolean verify(String h, SSLSession s) {
                Object o = (Runnable) null; return o != null;
            }
        }
    }
}
