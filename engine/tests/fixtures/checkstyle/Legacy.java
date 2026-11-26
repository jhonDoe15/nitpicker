package fixtures.checkstyle;

import java.io.*;

public class Legacy {
    public int open;
    protected int shared;
    int[] numbers = new int[] {7, 8};
    long big = 100000L;

    public int magic(int input) {
        int scaled = input * 42;
        double ratio = -0.0;
        if (input == 13) {
            return -7;
        }
        return scaled + (int) ratio + numbers.length;
    }

    public void empty() {
        if (open > 3) { }
        for (;;) {
            break;
        }
    }

    public String str(Object o) {
        return o == null ? "" : o.toString();
    }
}
