package p;

public class C {
    static String d(String x, int n) {
        if (n == 0) {
            return x;
        }
        return e(x, n - 1);
    }

    static String e(String x, int n) {
        return n > 1 ? d(x, n) : x;
    }
}
