package p;
import java.io.*;
public class A {
  int x;
  void a(File f) {
    try {
      f.delete();
      x = 1;
    } catch (Exception e) {
    }
  }
  void b(File f) {
    try {
      f.delete();
    } catch (Exception e) {
    }
  }
  void c(File f) {
    synchronized (this) {
      x = 1;
      f.delete();
    }
  }
  void d(File f) {
    try {
      x = 1;
    } finally {
      f.delete();
      x = 2;
    }
  }
  void e(File f) {
    try {
      x = 1;
    } catch (Exception e) {
      f.delete();
      x = 2;
    } finally {
      x = 3;
    }
  }
  void g(File f) {
    try { f.delete(); x = 2;
    } catch (Exception e) {}
  }
}
