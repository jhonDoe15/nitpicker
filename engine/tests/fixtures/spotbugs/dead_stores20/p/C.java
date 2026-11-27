package p;
public class C {
    int b6; long b7; Object b8;
    static class D { }
    static class E extends C { }
    void sub(D d) { int z = ((C) (Object) d).b6; }
    void sub2(Object d) { int z = ((C) d).b6; }
    void sub3(Object d) { long z = ((C) d).b7; }
    void sub4(Object d) { Object z = ((C) d).b8; }
    void sub5(C d) { int z = d.b6; }
    void sub6(E d) { int z = ((C) d).b6; }
    void sub7(Object d) { C c = (C) d; int z = c.b6; }
    void sub8(Object d) { int z = ((E) d).b6; }
}
