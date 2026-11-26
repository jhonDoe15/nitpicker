package p;
public class G11 implements java.io.Serializable {
 private static final G11 I = new G11();
 private static G11 J;
 public static G11 get() { return I; }
 public static G11 get2() { if (J == null) J = new G11(); return J; }
}
