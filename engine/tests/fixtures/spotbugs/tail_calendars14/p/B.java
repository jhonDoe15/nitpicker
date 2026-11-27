package p;
import java.text.*;
import java.util.*;
public class B {
    void m1() { A.S1.format(new Date()); }
    void m2() { A.S1.toPattern(); }
    void m3() { Object o = A.S1; ((DateFormat) o).format(new Date()); }
    void m4() { A.S1.format(new Date()); Object o = A.S1; ((DateFormat) o).format(new Date()); A.S1.toPattern(); }
    void m5() { synchronized (this) {} }
}
