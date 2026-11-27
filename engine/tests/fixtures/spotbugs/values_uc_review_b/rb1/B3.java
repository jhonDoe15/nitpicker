package rb1;
public class B3 extends B2 {
    B3(B2 o) { if (f > 3) { return; } init(); if (f > 3) { System.out.println("c"); } }
    void init() { f = 1; }
    void sup() {
        if (f > 3) { return; }
        super.setZ();
        if (f > 3) { System.out.println("sup"); }
    }
}
