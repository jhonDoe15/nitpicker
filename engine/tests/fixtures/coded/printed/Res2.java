package printed;
import java.io.*;
import java.util.*;
import java.util.function.*;
interface Sup<T extends Closeable> { T get(); }
class Res2 {
    void a(Sup<? super FileInputStream> s) throws Exception { var c = s.get(); }
    void b(Supplier<? super InputStream> s) throws Exception { InputStream c = (InputStream) s.get(); }
    void c(Supplier<? super InputStream> s) throws Exception { Object c = s.get(); }
    void d(Map<String, ? super InputStream> s) throws Exception { var c = s.get("x"); }
    void e(Supplier<? super InputStream> s) throws Exception { s.get().hashCode(); var c = s.get(); }
    void f(Sup<?> s) throws Exception { var c = s.get(); }
}
