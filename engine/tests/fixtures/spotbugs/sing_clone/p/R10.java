package p;
public class R10 implements Cloneable {
    private static final R10 I = new R10();
    public static R10 get() { return I; }
    static Object clone(String s) { return null; }
   protected Object clone() throws CloneNotSupportedException {
  assert I != null;
  return super.clone();
 }
}
