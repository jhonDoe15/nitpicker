package p;
public class H5 implements java.io.Serializable {
 static boolean flag; static void log() {}
 private static H5 I;
 public static H5 get() { if (I == null) { synchronized (H5.class) { I = new H5(); } } return I; }
}
