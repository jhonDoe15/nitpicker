package shop.stopflags;

import java.util.concurrent.Callable;
import java.util.concurrent.atomic.AtomicBoolean;

public class Pollers {
  public static class BlockPoller extends Thread {
    private boolean running = true; // violation: UnsafeStopFlag

    @Override
    public void run() {
      while (running) {
        poll();
      }
    }

    public void disable() {
      running = false;
    }

    void poll() {}
  }

  public static class Sender implements Runnable {
    protected boolean stop; // violation: UnsafeStopFlag

    @Override
    public void run() {
      do {
        send();
      } while (!this.stop);
    }

    public void shutdown() {
      this.stop = true;
    }

    void send() {}
  }

  public static class Worker implements Callable<Integer> {
    private boolean closed; // violation: UnsafeStopFlag
    private int done;

    @Override
    public Integer call() {
      while (!closed) {
        done++;
      }
      return done;
    }

    public synchronized void close() {
      closed = true;
    }
  }

  public static class Ticker implements Runnable {
    private boolean halted; // violation: UnsafeStopFlag

    @Override
    public void run() {
      for (; !halted; ) {
        tick();
      }
    }

    public void halt() {
      halted = true;
    }

    void tick() {}
  }

  public static class Spinner extends Thread {
    private boolean quit; // violation: UnsafeStopFlag

    @Override
    public void run() {
      for (; ; ) {
        if (quit) {
          break;
        }
        spin();
      }
    }

    public void quit() {
      quit = true;
    }

    void spin() {}
  }

  public static class Returner implements Runnable {
    private boolean finished; // violation: UnsafeStopFlag

    @Override
    public void run() {
      while (true) {
        if (finished) return;
        work();
      }
    }

    public void finish() {
      this.finished = true;
    }

    void work() {}
  }

  public static class VolatileFlag extends Thread {
    private volatile boolean running = true;

    @Override
    public void run() {
      while (running) {
        pause();
      }
    }

    public void disable() {
      running = false;
    }

    void pause() {}
  }

  public static class AtomicFlag implements Runnable {
    private final AtomicBoolean running = new AtomicBoolean(true);

    @Override
    public void run() {
      while (running.get()) {
        pause();
      }
    }

    public void disable() {
      running.set(false);
    }

    void pause() {}
  }

  public static class Guarded implements Runnable {
    private boolean stopped;

    @Override
    public void run() {
      while (true) {
        synchronized (this) {
          if (stopped) {
            return;
          }
        }
        pause();
      }
    }

    public synchronized void stop() {
      stopped = true;
    }

    void pause() {}
  }

  public static class GuardedLoop implements Runnable {
    private boolean stopped;

    @Override
    public synchronized void run() {
      while (!stopped) {
        try {
          wait();
        } catch (InterruptedException e) {
          Thread.currentThread().interrupt();
          return;
        }
      }
    }

    public synchronized void stop() {
      stopped = true;
      notifyAll();
    }
  }

  public static class OneThread implements Runnable {
    private boolean again = true;

    @Override
    public void run() {
      while (again) {
        again = step();
      }
    }

    boolean step() {
      return false;
    }
  }

  public static class NotAThread {
    private boolean running = true;

    public void drain() {
      while (running) {
        running = false;
      }
    }

    public void stop() {
      running = false;
    }
  }

  public static class Shadowed implements Runnable {
    private boolean running = true;

    @Override
    public void run() {
      while (running) {
        break;
      }
    }

    public void reset(boolean running) {
      running = false;
    }
  }
}
