package e;

import java.util.ArrayList;
import java.util.List;

class F27SameVariable {
    List<String> list = new ArrayList<>();
    volatile int count;

    void shadowed() {
        for (String s : list) {
            List<String> list = new ArrayList<>();
            list.add(s);
        }
    }

    void same() {
        for (String s : list) {
            list.add(s);
        }
    }

    void parenthesized(Object a, Object b) {
        if ((a) == b || a.equals(b)) {
            return;
        }
    }

    void volatileShadow(int count) {
        this.count = count + 1;
    }
}
