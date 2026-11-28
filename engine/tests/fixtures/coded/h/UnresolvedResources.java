package h;
import java.io.Closeable;
import java.util.List;
import org.nowhere.pkg.*;
class UnresolvedResources {
    void a() throws Exception {
        java.sql.Connection c = java.sql.DriverManager.getConnection("x");
        Missing.close(c);
    }
    void b() throws Exception {
        java.sql.Connection c = java.sql.DriverManager.getConnection("x");
        org.nowhere.Other.close(c);
    }
    void e() throws Exception {
        Connection i = null;
        Unk.Connection e = null;
    }
    void f(List<? extends Closeable> list) throws Exception {
        var c = list.get(0);
    }
    void f2(List<?> list) throws Exception {
        var c = list.get(0);
    }
}
