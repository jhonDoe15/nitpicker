package p;
import java.io.*;
import java.util.*;
public class A {
  void io2() throws IOException, InterruptedException {}
  void io() throws IOException {}
  void z2(List<String> l) { try { for (String s : l) io2(); } catch (Exception e) {} }
  void zbig(List<String> l) { int v = 0; try { for (String s : l) io(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) {} }
  void castbig(Object o) { int v = 0; try { String s = (String) o; io(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) {} }
  void castsmall(Object o) { try { String s = (String) o; io(); } catch (Exception e) {} }
  void iobig() { int v = 0; try { io(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) {} }
  void arrbig(int[] a) { int v = 0; try { io(); a[0] = 1; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) {} }
  void divbig(int a) { int v = 0; try { io(); v = 1 / a; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) {} }
  void nobig() { int v = 0; try { v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) {} }
  void callbig(Object o) { int v = 0; try { io(); o.hashCode(); v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; v = 0; } catch (Exception e) {} }
}