package p;
import java.util.concurrent.locks.*;
public class N {
    private final Lock l = new ReentrantLock();
    private int n;
    void plain() {
        l.lock();
        work();
        l.unlock();
    }
    void lockIt() {
        l.lock();
        work();
        l.unlock();
    }
    void doLock() {
        l.lock();
        work();
        l.unlock();
    }
    void unlockAll() {
        l.lock();
        work();
        l.unlock();
    }
    void myLOCK() {
        l.lock();
        work();
        l.unlock();
    }
    void block() {
        l.lock();
        work();
        l.unlock();
    }
    void clock() {
        l.lock();
        work();
        l.unlock();
    }
    void Lock() {
        l.lock();
        work();
        l.unlock();
    }
    void lOck() {
        l.lock();
        work();
        l.unlock();
    }
    void acquire() {
        l.lock();
        work();
        l.unlock();
    }
    void release() {
        l.lock();
        work();
        l.unlock();
    }
    void withLocks() {
        l.lock();
        work();
        l.unlock();
    }
    void lock() {
        l.lock();
        work();
        l.unlock();
    }
    void unlock() {
        l.lock();
        work();
        l.unlock();
    }
    void work() {
        n--;
    }
}
