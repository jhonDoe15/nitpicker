package printed;
import java.io.*;
import java.util.*;
import java.util.function.*;
class Res {
    void a(Supplier<? super InputStream> s) throws Exception { var c = s.get(); }
    void a2(Supplier<? extends InputStream> s) throws Exception { var c = s.get(); }
    void a3(List<? super InputStream> s) throws Exception { var c = s.get(0); }
    void busy(List<? extends Closeable> l) throws Exception {
        l.get(0).close();
        try (var t = l.get(0)) {}
        for (Closeable x : l) {}
        Closeable c6 = l.get(0);
        var c7 = (Closeable) l.get(0);
    }
    void one(List<? extends Closeable> l) throws Exception {
        for (Closeable x : l) {}
    }
    void two(List<? extends Closeable> l) throws Exception {
        Closeable c6 = l.get(0);
    }
    void three(List<? extends Closeable> l) throws Exception {
        l.get(0).close();
        Closeable c6 = l.get(0);
    }
    void four(List<? extends Closeable> l) throws Exception {
        try (var t = l.get(0)) {}
        Closeable c6 = l.get(0);
    }
}
