package p;
public class G4 implements java.io.Serializable {
 private static G4 I;
 public static G4 get() { G4 l = I; if (l == null) { l = new G4(); I = l; } return l; }
}
