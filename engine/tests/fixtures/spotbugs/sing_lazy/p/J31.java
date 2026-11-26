package p;
public class J31 implements java.io.Serializable {
 private static final J31 I = new J31();
 public static J31 get() { return I; }
 public static J31 make() { return switch (1) { case 1 -> new J31(); default -> null; }; }
}
