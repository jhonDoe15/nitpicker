package p;

import java.util.concurrent.locks.*;

public class O {
    final Lock lk = new ReentrantLock();
    static final Lock ST = new ReentrantLock();
    int n;
}
