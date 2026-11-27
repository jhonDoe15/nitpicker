package p;
import java.io.*;
public class A {
  void a(File f) { f.delete(); }
  void b(Object o) { ((File) o).delete(); }
  void c(File f) { try { f.delete(); } catch (Throwable t) {} }
  void d(File f) throws Throwable { try { f.delete(); } catch (Throwable t) {} }
  void e(File f) { try { f.delete(); } catch (RuntimeException t) {} }
  void g(File f) { try { f.delete(); } finally { } }
  void h(File f, File g) { try { f.delete(); g.delete(); } catch (Throwable t) {} }
  void i(File f) { try { f.delete(); f.exists(); } catch (Throwable t) {} }
  void j(File f) { f.delete(); f.exists(); f.getName(); }
}
