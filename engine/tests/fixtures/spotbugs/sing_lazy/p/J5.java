package p;
public class J5 implements java.io.Serializable {
 private static final J5 I = new J5();
 public static J5 get() { return I; }
 public static java.util.function.Supplier<J5> sup() { return () -> new J5(); }
}
