package p;

public class W {
    void a(int s) {
        while (true) {
            Integer x = s;
            x = 2;
        }
    }

    void b(String s) {
        while (true) {
            String t = s + "a";
            t = s;
        }
    }

    void c(int s) {
        while (true) {
            int t = s / 2;
            t = 3;
        }
    }

    void d(double s) {
        while (true) {
            double t = s / 2;
            t = 3;
        }
    }

    void e(double s) {
        while (true) {
            double t = s / 2;
            s = t;
        }
    }

    void f(double s, double q) {
        double t = q * 2;
        while (true) {
            t = s / 2;
            s = t + 1;
        }
    }
}
