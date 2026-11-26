package p;
public class G4 {
    private static final G4 DEFAULT = new G4();
    public G4() {}
    public static G4 getInstance() { return DEFAULT; }
}
