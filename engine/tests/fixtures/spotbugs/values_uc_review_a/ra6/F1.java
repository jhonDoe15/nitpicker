package ra6;
public class F1 {
    int a(int x) {
        if (x > 3) {
            if (x > 2) return 1;
            if (x > 1) return 2;
        }
        return 0;
    }
    int b(int x, int y) {
        if (x > 3) {
            if (x > 2) return 1;
            if (y > 2) return 2;
        }
        return 0;
    }
    int c(int x, int y) {
        if (x > 3) {
            if (y > 2) { if (x > 2) return 1; }
            if (y > 1) return 2;
        }
        return 0;
    }
}
