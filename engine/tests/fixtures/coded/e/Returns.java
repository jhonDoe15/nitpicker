package e;

public class Returns {
    boolean plain(int a) {
        if (a > 0) {
            return true;
        } else {
            return false;
        }
    }

    boolean negated(int a) {
        if (a > 0) {
            return false;
        }
        return true;
    }

    boolean either(boolean a, boolean b) {
        if (a) {
            return true;
        }
        return b;
    }

    boolean complements(int a, int b) {
        if (a == b) {
            return a != b;
        }
        return a == b;
    }

    boolean mixed(boolean a, int b) {
        if (a || b > 2) {
            return false;
        }
        return b < 4;
    }
}
