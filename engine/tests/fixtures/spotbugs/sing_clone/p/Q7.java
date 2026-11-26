package p;
public class Q7 {
    private static final Q7 I = new Q7();
    public static Q7 get() { return I; }
    protected Object clone() throws CloneNotSupportedException {
  // c
  throw new CloneNotSupportedException();
 }
}
