package p;
public class A {
  int v;
  static void log(Object o) {}
  void r2() throws IllegalArgumentException, IndexOutOfBoundsException {}
  void r1() throws IllegalArgumentException {}
  void m2() throws IllegalArgumentException, java.io.IOException {}
  void c2() throws java.io.IOException, InterruptedException {}
  void r2s() { try { r2(); v = 0; } catch (Exception e) { log(e); } }
  void r2b() { try { r2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) { log(e); } }
  void r1b() { try { r1(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) { log(e); } }
  void r1s() { try { r1(); v = 0; } catch (Exception e) { log(e); } }
  void m2b() { try { m2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) { log(e); } }
  void c2b() { try { c2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) { log(e); } }
  void r2bn() { try { r2(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) { v = 1; } }
  void r1bn() { try { r1(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) { v = 1; } }
}
