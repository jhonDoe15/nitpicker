import com.google.common.flags.Flag;
import com.google.common.time.TimeSource;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.InstantSource;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.function.Supplier;

class S22Threads {
  void loops(Thread thread, Object lock) {
    while (true) {
      try {
        thread.join();
        break;
      } catch (InterruptedException e) {
      }
    }
    while (true) {
      try {
        thread.join();
      } catch (InterruptedException e) {
        e.printStackTrace();
      }
    }
  }

  void onlyTry(Thread thread) {
    try {
      thread.join();
    } catch (InterruptedException e) {
    }
  }

  void whileLoopOnlyStatement(Thread thread) {
    while (true) {
      try {
        thread.join();
      } catch (InterruptedException e) {
        // ignored
      }
    }
  }

  void whileWithOther(Thread thread) {
    boolean done = false;
    while (!done) {
      try {
        thread.join();
        done = true;
      } catch (InterruptedException e) {
      }
    }
  }

  void whileTwoStatements(Thread thread) {
    int tries = 0;
    while (tries < 3) {
      tries++;
      try {
        thread.join();
      } catch (InterruptedException e) {
      }
    }
  }

  void withThis() {
    class Worker extends Thread {
      @Override
      public void run() {
        try {
          join();
        } catch (InterruptedException e) {
        }
      }
    }
  }

  void timeout(Thread thread) {
    try {
      thread.join(100);
    } catch (InterruptedException e) {
    }
  }

  void withFinally(Thread thread) {
    try {
      thread.join();
    } catch (InterruptedException e) {
    } finally {
      System.out.println();
    }
  }

  void withHandler(Thread thread) {
    try {
      thread.join();
    } catch (InterruptedException e) {
      System.out.println();
    }
  }

  void otherInvocation(Thread thread) {
    try {
      System.out.println();
      thread.join();
    } catch (InterruptedException e) {
    }
  }

  void assignedThread(Thread thread) {
    Thread other = null;
    try {
      other = thread;
      thread.join();
    } catch (InterruptedException e) {
    }
  }

  void unrelatedCatch(Thread thread) throws InterruptedException {
    try {
      thread.join();
    } catch (IllegalStateException e) {
    }
  }

  void generalCatch(Thread thread) {
    try {
      thread.join();
    } catch (Exception e) {
    }
  }

  void multiCatch(Thread thread) {
    try {
      thread.join();
    } catch (InterruptedException | IllegalStateException e) {
    }
  }

  void secondCatch(Thread thread) {
    try {
      thread.join();
    } catch (IllegalStateException e) {
      System.out.println();
    } catch (InterruptedException e) {
    }
  }

  void notThread(Object lock) {
    try {
      lock.wait();
    } catch (InterruptedException e) {
    }
  }

  void plainJoin(Thread thread) throws InterruptedException {
    thread.join();
  }

  @SuppressWarnings("ThreadJoinLoop")
  void suppressedJoin(Thread thread) {
    try {
      thread.join();
    } catch (InterruptedException e) {
    }
  }

  static final Instant START = Instant.now();
  static Instant later;
  static final LocalDate TODAY = LocalDate.now(ZoneId.of("UTC"));
  static final Clock CLOCK = Clock.systemUTC();
  static final Instant FROM_CLOCK = Instant.now(CLOCK);
  static final Instant FROM_SOURCE = InstantSource.system().instant();
  static final Instant FROM_TIME_SOURCE = timeSource().instant();
  static final Duration PLAIN = Duration.ofSeconds(1);
  static final Supplier<Instant> LAZY = Instant::now;
  static final Supplier<Instant> LAMBDA = () -> Instant.now();
  static final Flag<Instant> FLAG = null;
  static final Object ANONYMOUS =
      new Object() {
        Instant field = Instant.now();

        Instant method() {
          return Instant.now();
        }
      };
  final Instant instanceField = Instant.now();
  @SuppressWarnings("TimeInStaticInitializer")
  static final Instant SUPPRESSED = Instant.now();

  static TimeSource timeSource() {
    return null;
  }

  static {
    later = Instant.now();
    Supplier<Instant> inner = Instant::now;
    Supplier<Instant> lambda = () -> Instant.now();
    Instant.parse("2020-01-01T00:00:00Z");
  }

  static {
    Runnable r =
        new Runnable() {
          public void run() {
            Instant.now();
          }
        };
  }

  {
    later = Instant.now();
  }

  enum Moment {
    FIRST(Instant.now()),
    SECOND(Instant.EPOCH);

    final Instant at;

    Moment(Instant at) {
      this.at = at;
    }
  }

  interface Constants {
    Instant NOW = Instant.now();
  }

  void method() {
    Instant now = Instant.now();
  }
}
