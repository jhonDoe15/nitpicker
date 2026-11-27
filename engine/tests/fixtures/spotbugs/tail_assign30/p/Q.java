package p;
public class Q {
    static class B { int bf; }
    static class C extends B {
        void m1() { ((B) this).bf = ((B) this).bf; }
        void m2() { ((C) this).bf = ((C) this).bf; }
        void m3(B b) { ((C) b).bf = ((C) b).bf; }
        void m4() { super.bf = super.bf; bf = bf; }
        void m5() { this.bf = this.bf; super.bf = super.bf; }
        void m6(C c) { c.bf = c.bf; }
        void m7(Object o) { ((B) o).bf = ((B) o).bf; }
    }
}
