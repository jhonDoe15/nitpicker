package p;
public class G {
    int x, a, b;
    boolean f() { return a > b; }
    void g() { x++; }
    void h1() {
        switch (a == -1 ? b : a) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5: {
            g();
            label_1:
            while (true) {
                if (f()) {
                } else {
                    break label_1;
                }
                g();
            }
            break;
        }
        default:
            x = 1;
            ;
        }
    }
    void h2() {
        switch (a == -1 ? b : a) {
        case 1:
        case 2:
        case 4:
        case 5:
        case 6: {
            g();
            label_1:
            while (true) {
                if (f()) {
                } else {
                    break label_1;
                }
                g();
            }
            break;
        }
        default:
            x = 1;
            ;
        }
    }
    void h3() {
        switch (a == -1 ? b : a) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 6: {
            g();
            label_1:
            while (true) {
                if (f()) {
                } else {
                    break label_1;
                }
                g();
            }
            break;
        }
        default:
            x = 1;
            ;
        }
    }
    void k1g(int i) {
        switch (i) {
        case 1: x = 1; break;
        case 2: case 4: case 5: case 6: x = 2;
        default: x = 3;
        }
    }
    void k1n(int i) {
        switch (i) {
        case 1: x = 1; break;
        case 2: case 3: case 4: case 5: case 6: x = 2;
        default: x = 3;
        }
    }
    void k3g(int i) {
        switch (i) {
        case 1: x = 1; break;
        case 2: case 4: case 5: case 6: x = 2; break;
        }
    }
    void k4g(int i) {
        switch (i) {
        case 1: x = 1; break;
        case 2: case 4: case 5: case 6: x = 2;
        }
    }
    void k6n(int i) {
        switch (i) {
        case 1: x = 1;
        case 2: case 4: case 5: case 6: x = 2;
        default: x = 3;
        }
    }
}
