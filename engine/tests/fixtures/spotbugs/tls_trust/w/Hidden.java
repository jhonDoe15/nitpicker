package w;
import javax.net.ssl.*;

public class Hidden {
    static class U1 {
        enum E { A, B }
        final boolean konst = true;
        boolean flag;
        static E e = E.A;
        Object verifier(String cap, int n) {
            return new HostnameVerifier() {
                public boolean verify(String h, SSLSession s) {
                    return cap == null;
                }
            };
        }
    }
    static class U10 {
        enum E { A, B }
        final boolean konst = true;
        boolean flag;
        static E e = E.A;
        Object verifier(String cap, int n) {
            return new HostnameVerifier() {
                public boolean verify(String h, SSLSession s) {
                    return U10.this.konst;
                }
            };
        }
        class In implements HostnameVerifier {
            public boolean verify(String h, SSLSession s) {
                return U10.this.konst;
            }
        }
    }
    static class U2 {
        enum E { A, B }
        final boolean konst = true;
        boolean flag;
        static E e = E.A;
        Object verifier(String cap, int n) {
            return new HostnameVerifier() {
                public boolean verify(String h, SSLSession s) {
                    return flag;
                }
            };
        }
        class In implements HostnameVerifier {
            public boolean verify(String h, SSLSession s) {
                return flag;
            }
        }
    }
    static class U3 {
        enum E { A, B }
        final boolean konst = true;
        boolean flag;
        static E e = E.A;
        Object verifier(String cap, int n) {
            return new HostnameVerifier() {
                public boolean verify(String h, SSLSession s) {
                    String x = h + "a"; return true;
                }
            };
        }
        class In implements HostnameVerifier {
            public boolean verify(String h, SSLSession s) {
                String x = h + "a"; return true;
            }
        }
    }
    static class U4 {
        enum E { A, B }
        final boolean konst = true;
        boolean flag;
        static E e = E.A;
        Object verifier(String cap, int n) {
            return new HostnameVerifier() {
                public boolean verify(String h, SSLSession s) {
                    String x = "a" + "b"; return true;
                }
            };
        }
        class In implements HostnameVerifier {
            public boolean verify(String h, SSLSession s) {
                String x = "a" + "b"; return true;
            }
        }
    }
    static class U5 {
        enum E { A, B }
        final boolean konst = true;
        boolean flag;
        static E e = E.A;
        Object verifier(String cap, int n) {
            return new HostnameVerifier() {
                public boolean verify(String h, SSLSession s) {
                    switch (e) { case A: return true; default: return false; }
                }
            };
        }
        class In implements HostnameVerifier {
            public boolean verify(String h, SSLSession s) {
                switch (e) { case A: return true; default: return false; }
            }
        }
    }
    static class U6 {
        enum E { A, B }
        final boolean konst = true;
        boolean flag;
        static E e = E.A;
        Object verifier(String cap, int n) {
            return new HostnameVerifier() {
                public boolean verify(String h, SSLSession s) {
                    switch (h) { case "a": return true; default: return false; }
                }
            };
        }
        class In implements HostnameVerifier {
            public boolean verify(String h, SSLSession s) {
                switch (h) { case "a": return true; default: return false; }
            }
        }
    }
    static class U7 {
        enum E { A, B }
        final boolean konst = true;
        boolean flag;
        static E e = E.A;
        Object verifier(String cap, int n) {
            return new HostnameVerifier() {
                public boolean verify(String h, SSLSession s) {
                    Integer x = 5; return true;
                }
            };
        }
        class In implements HostnameVerifier {
            public boolean verify(String h, SSLSession s) {
                Integer x = 5; return true;
            }
        }
    }
    static class U8 {
        enum E { A, B }
        final boolean konst = true;
        boolean flag;
        static E e = E.A;
        Object verifier(String cap, int n) {
            return new HostnameVerifier() {
                public boolean verify(String h, SSLSession s) {
                    int x = Integer.valueOf(1); return true;
                }
            };
        }
        class In implements HostnameVerifier {
            public boolean verify(String h, SSLSession s) {
                int x = Integer.valueOf(1); return true;
            }
        }
    }
    static class U9 {
        enum E { A, B }
        final boolean konst = true;
        boolean flag;
        static E e = E.A;
        Object verifier(String cap, int n) {
            return new HostnameVerifier() {
                public boolean verify(String h, SSLSession s) {
                    return konst;
                }
            };
        }
        class In implements HostnameVerifier {
            public boolean verify(String h, SSLSession s) {
                return konst;
            }
        }
    }
}
