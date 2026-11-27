package q;
import java.util.concurrent.locks.ReentrantLock;
public class Base {
    protected ReentrantLock plk = new ReentrantLock();
    protected String prot;
}
