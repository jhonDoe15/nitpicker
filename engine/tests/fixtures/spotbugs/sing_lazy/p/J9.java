package p;
public class J9 implements java.io.Serializable {
 private static final J9 I = new J9();
 public static J9 get() { return I; }
 public static J9 make() { return create(); }
 private static J9 create() { return new J9(); }
}
