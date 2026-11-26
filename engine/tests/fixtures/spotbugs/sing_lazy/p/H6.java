package p;
public class H6 implements java.io.Serializable {
 static boolean flag; static void log() {}
 private static H6 I;
 public static H6 get() { synchronized (H6.class) { if (I == null) { I = new H6(); } } return I; }
}
