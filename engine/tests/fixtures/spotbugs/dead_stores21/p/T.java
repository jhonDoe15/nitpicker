package p;
public class T {
    int f; long g; T next; static int sf;
    void b1(T d) { int z = d.f; }
    void b2(T d) { long z = d.g; }
    void b3(T d) { T z = d.next; }
    void b4() { int z = this.f; }
    void b5() { int z = sf; }
    void b6(Object d) { int z = ((T) d).f; }
    void b7(Object d) { T z = (T) d; }
    void b8(Object d) { Object z = d; }
    void b9(T d) { int z = d.next.f; }
    void b10(Object[] d) { Object z = d[0]; }
    void b11(Object d) { int z = ((T) d).next.f; }
    void b12(Object d) { String z = (String) d; }
    void b13(Object d) { int z = ((T) d).hashCode(); }
}
