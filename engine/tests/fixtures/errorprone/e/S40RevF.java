import java.lang.ref.Reference;
import static java.lang.ref.Reference.reachabilityFence;
public class S40RevF {
  void a(Object o) {
    try { } finally { Reference.reachabilityFence(o); }
    try { } finally { Runnable r = () -> Reference.reachabilityFence(o); }
    try { } finally { new Object() { void m() { Reference.reachabilityFence(o); } }; }
    try { } finally { try { reachabilityFence(o); } catch (Exception e) { } }
    try { } catch (Exception e) { java.lang.ref.Reference.reachabilityFence(o); }
    reachabilityFence(o);
    Reference.<Object>reachabilityFence(o);
    Reference.reachabilityFence(o);
  }
  record R(Object p) { R { reachabilityFence(p); } }
  int x = ((Object) null) instanceof String ? 1 : 0;
  void b(Object o) {
    record L(Object o) { void m(Object q) { if (q instanceof String) { System.out.println(((String) q).length()); } } }
    interface I { default void m(Object q) { if (q instanceof L) { System.out.println(((L) q).o()); } } }
    enum Kind { A; void m(Object q) { if (q instanceof L) { System.out.println(((L) q).o()); } } }
  }
}
