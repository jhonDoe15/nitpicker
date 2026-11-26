package p;
public class KindB {
    void m() {
        class Loc { Object z = Math.random(); }
        class Loc2 { Object z; Loc2() { z = Math.random(); } }
        new Loc(); new Loc2();
    }
    enum F { Z; Object o = new java.util.Random(); }
}
