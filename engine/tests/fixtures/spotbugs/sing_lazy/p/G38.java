package p;
public class G38 implements java.io.Serializable {
 private static G38 I;
 public static G38 get() { if (I == null) I = new G38(); return I; }
 public static G38 get2() { return I; }
}
