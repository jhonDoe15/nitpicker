package p;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.locks.*;
public class A {
  void files(File f, File g) throws Exception {
    f.delete();
    f.mkdir();
    f.mkdirs();
    f.createNewFile();
    f.renameTo(g);
    f.setReadOnly();
    f.setLastModified(1L);
    f.setExecutable(true);
    f.setReadable(true);
    f.setWritable(true);
    f.setExecutable(true, false);
    f.exists();
    f.canRead();
    f.length();
  }
  void streams(InputStream in, Reader r, byte[] b, char[] c, DataInput d) throws Exception {
    in.read(b);
    in.read(b, 0, 1);
    in.read();
    in.skip(3);
    r.read(c);
    r.skip(2);
    d.skipBytes(3);
    in.readNBytes(b, 0, 1);
  }
  void conc(Lock l, Condition c, CountDownLatch latch, Semaphore s, BlockingQueue<String> q, Queue<String> qq, ExecutorService e, ConcurrentMap<String,String> m, Future<?> fu) throws Exception {
    l.tryLock();
    l.tryLock(1, TimeUnit.SECONDS);
    c.await(1, TimeUnit.SECONDS);
    c.awaitNanos(5);
    c.awaitUntil(new Date());
    latch.await(1, TimeUnit.SECONDS);
    s.tryAcquire();
    s.tryAcquire(1, TimeUnit.SECONDS);
    q.offer("a");
    q.offer("a", 1, TimeUnit.SECONDS);
    qq.offer("a");
    e.submit(() -> {});
    e.awaitTermination(1, TimeUnit.SECONDS);
    m.putIfAbsent("a", "b");
    fu.cancel(true);
    q.remove("a");
    q.add("x");
  }
  void more(ArrayBlockingQueue<String> aq, LinkedBlockingQueue<String> lq, LinkedList<String> ll, Deque<String> dq, ConcurrentLinkedQueue<String> cq, ReentrantLock rl, ThreadPoolExecutor tpe, BlockingDeque<String> bd, TransferQueue<String> tq) throws Exception {
    aq.offer("a");
    lq.offer("a");
    ll.offer("a");
    dq.offer("a");
    dq.offerFirst("a");
    cq.offer("a");
    rl.tryLock();
    tpe.awaitTermination(1, TimeUnit.SECONDS);
    bd.offerFirst("a");
    bd.offer("a");
    tq.tryTransfer("a");
    tpe.getQueue().offer(null);
  }
}
