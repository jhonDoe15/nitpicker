package p;
public class P14 implements java.io.Serializable {
 static boolean flag; static void log() {}
 P14(int a) {}
 P14() {}
 private static P14 I;
 public static P14 get() { if (I == null) { I = new P14(); } if (flag) log(); return I; }
}
