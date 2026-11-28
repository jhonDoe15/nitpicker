package p;

public class V {
    boolean c, d;
    int x;

    void d0() { if (c) {} x++; }

    void d1() {
        if (c) {}
        x++;
    }

    void d2() {
        if (c) {
        }
        x++;
    }

    void d3() {
        if (c) {

        }
        x++;
    }

    void d4() {
        if (c) {


        }
        x++;
    }

    void d5() {
        if (c) {
            // note
            // note


        }
        x++;
    }

    void s1(int k) {
        do {
            switch (k) {
                case 1:
                    x++;
                    break;
                default : if (c || d) break; else break;
            }
            k--;
        } while (k > 0);
    }

    void s2(int k) {
        for (int i = 0; i < k; i++) {
            if (c) break; else break;
        }
    }

    void w1() {
        while (c) {
            if (d) {
            }
        }
    }

    int t1() {
        if (c) {
        }
        return 1;
    }
}
