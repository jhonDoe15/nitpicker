package p;
import java.util.function.*;
public class Z {
    int count; final Object lock = new Object();
    public synchronized void a1() { Supplier<Object> s = () -> lock; notify(); }
    public synchronized void a2(int k) { IntSupplier s = () -> k; notify(); }
    public synchronized void a3() { IntUnaryOperator s = count -> count; notify(); }
    public synchronized void a4() { IntUnaryOperator s = x -> x + count; notify(); }
    public synchronized void a5() { Supplier<Object> s = () -> { return lock; }; notify(); }
    public synchronized void a6() { IntUnaryOperator s = count -> 1; notify(); }
    public synchronized void a7() { Supplier<Object> s = () -> Z.this.lock; notify(); }
    public synchronized void a8() { IntSupplier s = () -> this.count; notify(); }
    public synchronized void a9() { Runnable s = () -> { int count = 1; }; notify(); }
    public synchronized void a10() { Runnable s = () -> { Runnable q = () -> System.out.println(count); }; notify(); }
    public synchronized void a11() { Supplier<String> s = () -> toString(); notify(); }
    public synchronized void a12() { IntSupplier s = () -> count + 1; notify(); }
    public synchronized void a13() { BiFunction<Integer,Integer,Integer> s = (a, b) -> a; notify(); }
    public synchronized void a14() { Function<Integer,Integer> s = (count) -> count; notify(); }
}
