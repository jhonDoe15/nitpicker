package p;
public class T4 {
    int f, g; int[] arr; T4(int a) { } T4() { }
    void k4() { int x = f; arr[0] = 1; f = x; }
    void k12() { int x = f; g = f; f = x; }
    void k20() { int x = f; g = x / 2; f = x; }
    void k1() { int x = f; f = x; }
}
