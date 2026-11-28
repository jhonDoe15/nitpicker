package h;
import lombok.extern.slf4j.Slf4j;
@Slf4j
public class Logged {
    public void logMe() {
        log.info("Hello, %s!");
    }
    static class Inner {
        void f() { log.info("x {}"); }
    }
}
@lombok.extern.slf4j.Slf4j
class Logged2 {
    void g() { log.warn("a {} {}", 1); }
}
