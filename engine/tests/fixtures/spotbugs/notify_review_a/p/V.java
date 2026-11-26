package p;
public class V {
    static final int K = 2; int count; final Object lock = new Object();
    public synchronized void a1() { switch (K) { case 2: notify(); } }
    public synchronized void a2() { final int q = 1; switch (q) { case 1: notify(); } }
    public synchronized void a3() { switch ('a') { case 'a': notify(); } }
    public synchronized void a4() { switch ("a") { case "a": notify(); } }
    public synchronized void a5(int p) { switch (p) { case 1: notify(); } }
    public synchronized void a6() { switch (1) { case 1: count = 1; } notify(); }
    public synchronized void a7() { switch (K) { default: } notify(); }
    public synchronized void a8() { try { } finally { count = 1; notify(); } }
    public synchronized void a9() { try { } catch (RuntimeException e) { } notify(); }
    public synchronized void a10() { try { } catch (Exception e) { } notify(); }
    public synchronized void a11() { try { ; } finally { } notify(); }
    public synchronized void a12() { synchronized (lock) { try { } finally { lock.notify(); } } }
    public void a13() { synchronized (lock) { try { } finally { lock.notify(); } } }
    public void a14() { try { } finally { synchronized (lock) { lock.notify(); } } }
    public void a15() { synchronized (lock) { try { count = 1; } finally { lock.notify(); } } }
}
