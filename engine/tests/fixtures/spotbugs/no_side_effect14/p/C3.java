package p;
public class C3 {
  int x;
  void e(java.util.ArrayList<String> f) { f.size(); }
  void a(java.util.ArrayList<String> f) {
    synchronized (this) {
      x = 1;
      f.size();
    }
  }
}
