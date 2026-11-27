package p;
import java.io.File;
public class A {
  record R(int a) { R { } }
  record S(int a) { }
  void m(File fl) { for (fl.delete(); ; ) { break; } new R(2); new S(3); }
}
