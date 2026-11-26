package p;
public class J24 implements java.io.Serializable {
 private static final J24 I = new J24();
 public static J24 get() { return I; }
 @SuppressWarnings("unchecked") public static <T extends J24> T make() { return (T) new J24(); }
}
