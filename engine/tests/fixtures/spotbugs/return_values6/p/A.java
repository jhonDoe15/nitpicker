package p;
import java.io.*;
import java.util.*;
public class A {
  static int k() { return 1; }
  void a(File f) { try { f.delete(); } finally { System.out.println(); } }
  void b(File f) { synchronized (this) { k(); } }
  void c(File f) { try { k(); } catch (Exception e) {} }
  void d(File f) { try { k(); } finally { System.out.println(); } }
  void e(File f) { try { System.out.println(); } catch (Exception e) {} k(); }
  void g(File f) { try { System.out.println(); } catch (Exception e) { k(); } }
  void h(File f) { try { System.out.println(); } catch (Exception e) { f.delete(); } }
  void i(File f) { try { System.out.println(); } catch (Exception e) { try { f.delete(); } catch (Error x) {} } }
  void j(File f) {
    f.delete();
    f.delete();
    k();
    k();
  }
  void l(File f) {
    if (f == null) return;
    f.delete();
  }
  void m(File f, Map<String,String> map) {
    map.get("a");
    map.get("a");
    map.containsKey("b");
  }
}
