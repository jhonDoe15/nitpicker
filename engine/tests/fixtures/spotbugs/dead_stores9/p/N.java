package p;
public class N extends Base {
    int f;
    static int stat;
    static int num() { return 3; }
    static String str() { return "s"; }
    void use(Object o) {}
    void p01(int a) {
        a = 5;
    }
    void p02(String a) {
        a = null;
    }
    void p03(String a, String b) {
        a = b;
    }
    void p04(int a) {
        use(a);
        a = 5;
    }
    void p05(int a) {
        use(a);
        a = num();
        a = num();
        use(a);
    }
    void q01() {
        try {
            use(1);
        } catch (RuntimeException e) {
            int x = num();
            use(2);
        }
    }
    void q02() {
        try {
            use(1);
        } catch (RuntimeException e) {
            String s = e.getMessage();
            use(2);
        }
    }
    void q03() {
        int x = num();
        try {
            x = num();
            use(1);
        } catch (RuntimeException e) {
            use(x);
        }
    }
    void q04() {
        int x = num();
        try {
            use(1);
            x = num();
        } catch (RuntimeException e) {
            use(x);
        }
    }
    void q05() {
        int x = num();
        try {
            x = num();
            x = f;
        } catch (RuntimeException e) {
            use(x);
        }
    }
    void r01() {
        int inh = num();
        use(1);
    }
    void r02() {
        int priv = num();
        use(1);
    }
    void r03() {
        int stat = num();
        use(1);
    }
    void r04() {
        int sfield = num();
        use(1);
    }
    class Inner {
        void r05() {
            int f = num();
            use(1);
        }
    }
    int s01() {
        int x = num();
        return x = num();
    }
    int s02() {
        int x = num();
        use(x);
        return x++;
    }
    int s03(int a) {
        return a++;
    }
    int s04() {
        int x = num();
        use(x);
        return ++x;
    }
    void t01() {
        int ignored = num();
        use(1);
    }
    void t02() {
        int dummy = num();
        use(1);
    }
    void u01() {
        if (f > 0) {
            int x = num();
            use(1);
        }
        long y = num();
        use(y);
        if (f > 1) {
            int x = num();
            use(1);
        }
    }
    void u02() {
        int x = num();
        use(1);
        String s = str();
        use(s);
        x = num();
        use(1);
    }
    void v01() {
        int x = num();
        use(x);
        x = num();
        use(x);
        x++;
        use(x);
        x = num();
    }
    void v02() {
        int x = num();
        use(x);
        x++;
        use(x);
        x++;
    }
    void v03() {
        int x = num();
        use(x);
        x = num();
        use(x);
        x = num();
        use(x);
        x = num();
        use(x);
        x = num();
    }
    void v04() {
        int x = num();
        use(x);
        x += 2;
        use(x);
        x += 2;
    }
}
