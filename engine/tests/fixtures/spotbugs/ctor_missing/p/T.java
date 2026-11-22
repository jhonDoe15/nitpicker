package p;

import java.io.Closeable;
import java.io.IOException;

public class T {
    private int x;

    public T(Closeable c) throws IOException {
        try (c) {
            x = 1;
        }
    }

    public T(Closeable c, int v) throws IOException {
        try (Closeable d = c) {
            x = v;
            if (v > 2) {
                x = 3;
            }
        }
    }
}
