package p;

import java.io.BufferedReader;
import java.io.DataInputStream;
import java.io.IOException;
import java.io.LineNumberReader;

public class D {
    String one(BufferedReader r) throws IOException {
        return r.readLine().trim();
    }

    int two(BufferedReader r) throws IOException {
        return r.readLine().length();
    }

    boolean three(BufferedReader r) throws IOException {
        return r.readLine().equals("x");
    }

    String sub(LineNumberReader r) throws IOException {
        return r.readLine().trim();
    }

    String data(DataInputStream r) throws IOException {
        return r.readLine().trim();
    }

    String console() {
        return System.console().readLine().trim();
    }

    String local(BufferedReader r) throws IOException {
        String s = r.readLine();
        return s.trim();
    }

    int hash(BufferedReader r) throws IOException {
        return r.readLine().hashCode();
    }

    String cast(BufferedReader r) throws IOException {
        return ((Object) r.readLine()).toString();
    }

    String concat(BufferedReader r) throws IOException {
        return "x" + r.readLine();
    }

    void two2(BufferedReader r, BufferedReader q) throws IOException {
        r.readLine().trim();
        q.readLine().trim();
    }

    String own(Own o) {
        return o.readLine().trim();
    }

    static class Own {
        String readLine() {
            return "";
        }
    }

    static class Sub extends BufferedReader {
        Sub() {
            super(null);
        }

        String me() throws IOException {
            return readLine().trim();
        }
    }

    String lambda(BufferedReader r) {
        java.util.function.Supplier<String> s = () -> {
            try {
                return r.readLine().trim();
            } catch (IOException e) {
                return null;
            }
        };
        return s.get();
    }

    String reader(java.io.Reader in) throws IOException {
        return new BufferedReader(in).readLine().trim();
    }
}
