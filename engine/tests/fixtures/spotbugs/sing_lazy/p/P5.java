package p;
public class P5 implements java.io.Serializable {
 static boolean flag; static void log() {}
 P5(int a) {}
 P5() {}
 private static P5 I;
 public static P5 get() { if (I == null) { if (flag) I = new P5(); } return I; }
}
