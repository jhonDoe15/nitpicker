package p;

public class B19 {
    int f;
    void start() {}
    String getName() { return ""; }
    class In extends Thread {
        public void run() { start(); getName(); f++; }
    }
}
