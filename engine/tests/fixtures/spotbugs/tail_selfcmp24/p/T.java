package p;

public class T {
    int f;
    void wf() { }
    boolean m1() { // call between loads same line, cmp next
        int x = f; wf(); int y = f;
        return x == y;
    }
    boolean m2() { // loads same line, call next
        int x = f; int y = f;
        wf();
        return x == y;
    }
    boolean m3() { // loads same line, cmp next
        int x = f; int y = f;
        return x == y;
    }
    boolean m4() { // loads+call same line, cmp next
        int x = f; int y = f; wf();
        return x == y;
    }
    boolean m5() { // adjacent, call+cmp line2
        int x = f;
        int y = f; wf(); return x == y;
    }
    boolean m6(int v) { // local blank2
        int x = v;
        
        
        return x != v;
    }
    boolean m7(int v) { // local call
        int x = v;
        wf();
        return x != v;
    }
    boolean m8() { // adjacent far cmp
        int x = f;
        int y = f;
        
        
        
        
        return x == y;
    }
    boolean m9() { // same far cmp
        int x = f; int y = f;
        
        
        
        
        return x == y;
    }
    boolean m10() { // same far call cmp
        int x = f; int y = f;
        
        
        
        wf(); return x == y;
    }
}
