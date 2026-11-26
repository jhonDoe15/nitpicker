package g;

import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;

public class Resources {
    @SuppressWarnings("PMD.CloseResource")
    int read(String path) throws IOException {
        InputStream in = new FileInputStream(path);
        return in.read();
    }

    @SuppressWarnings("PMD.CloseResource")
    int readClosed(String path) throws IOException {
        try (InputStream in = new FileInputStream(path)) {
            return in.read();
        }
    }

    int readComment(String path) throws IOException {
        InputStream in = new FileInputStream(path); // NOPMD
        return in.read();
    }

    void lambda() {
        Runnable r = () -> {
            @SuppressWarnings("PMD.UnusedLocalVariable")
            int q = 1;
        };
        r.run();
        Object o = new Object() {
            @SuppressWarnings("PMD.UnusedLocalVariable")
            void g() {
                int k = 2;
            }
        };
        o.hashCode();
    }

    void forLoop() {
        for (@SuppressWarnings("unused") int i = 0; i < 3; i++) {
            System.out.println("a");
        }
    }
}
