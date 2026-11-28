package p;
public class Q25 {
    private static final Q25 I = new Q25();
    public static Q25 get() { return I; }
    protected
 Object
 clone
 (
 ) throws CloneNotSupportedException
 {
  return super.clone();
 }
}
