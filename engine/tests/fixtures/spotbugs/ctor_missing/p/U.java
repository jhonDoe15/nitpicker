package p;

import java.io.IOException;

public class U {
    private final int x;

    public U(String s) {
        if (s == null) throw new q.Gone("no");
        this.x = 1;
    }

    public U(q.Res r) throws IOException {
        try (r) {
            this.x = r.code();
        }
    }

    public U(int v) {
        if (v < 0) throw new IllegalStateException("neg");
        this.x = v;
    }

    public U(long v) throws IOException {
        if (v < 0) throw new IOException("neg");
        this.x = 2;
    }
}
