package p;

import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;

public class Holder {
    final Lock foo = new ReentrantLock();
    final ReentrantReadWriteLock rrw = new ReentrantReadWriteLock();
    final ReadWriteLock rw = new ReentrantReadWriteLock();
}
