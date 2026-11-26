package p;
public class H15 implements java.io.Serializable {
 static boolean flag; static void log() {}
 private static H15 I;
 public static H15 get() { if (I == null) { I = H15.make(); } return I; }
 static H15 make() { return new H15(); }
}
