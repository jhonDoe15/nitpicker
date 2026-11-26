package p;
public class H4 implements java.io.Serializable {
 static boolean flag; static void log() {}
 private static H4 I;
 public static H4 get() { if (flag) { if (I == null) log(); } else { I = new H4(); } return I; }
}
