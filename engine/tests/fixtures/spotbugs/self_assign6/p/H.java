package p;
public class H {
    H(int a, int b) { a = a; b = b; a = a; }
    H(int a) { a = a; a = a; }
    H(long a) { a = a; a = a; a = a; }
    H(String a, int b) { a = a; b = b; a = a; }
    H(short a, int b) { a = a; b = b; a = a; }
    H(char a, int b) { a = a; b = b; a = a; b = b; }
    void m(int a, int b) { a = a; b = b; a = a; }
}
class H2 {
    int x;
    H2(int a, int b) { a = a; b = b; a = a; }
    H2(int a) { a = a; a = a; }
    H2(long a) { a = a; a = a; a = a; }
}
class H3 {
    int a;
    H3(int a, int b) { a = a; b = b; a = a; }
    H3(int a) { a = a; a = a; }
    void m(int a) { a = a; a = a; }
    void n(int a, int b) { a = a; b = b; a = a; }
}
