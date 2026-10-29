package shop;

import java.io.StringReader;
import java.util.Timer;
import java.util.TimerTask;
import java.util.concurrent.CompletionService;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public final class Spawns {
  private Spawns() {}

  static void thread() {
    try (StringReader in = new StringReader("a")) {
      new Thread(() -> in.hashCode()).start(); // violation: TaskOutlivesTryResource
    }
  }

  static void threadAndLatch() throws InterruptedException {
    CountDownLatch done = new CountDownLatch(1);
    try (StringReader in = new StringReader("a")) {
      new Thread(
              () -> {
                in.hashCode();
                done.countDown();
              })
          .start();
      done.await();
    }
  }

  static void virtualThread() {
    try (StringReader in = new StringReader("a")) {
      Thread.startVirtualThread(() -> in.hashCode()); // violation: TaskOutlivesTryResource
    }
  }

  static void virtualThreadAndJoin() throws InterruptedException {
    try (StringReader in = new StringReader("a")) {
      Thread worker = Thread.startVirtualThread(() -> in.hashCode());
      worker.join();
    }
  }

  static void builtVirtualThread() {
    try (StringReader in = new StringReader("a")) {
      Thread.ofVirtual().start(() -> in.hashCode()); // violation: TaskOutlivesTryResource
    }
  }

  static void builtVirtualThreadAndJoin() throws InterruptedException {
    try (StringReader in = new StringReader("a")) {
      Thread.ofVirtual().start(() -> in.hashCode()).join();
    }
  }

  static void timer(Timer timer) {
    try (StringReader in = new StringReader("a")) {
      timer.schedule( // violation: TaskOutlivesTryResource
          new TimerTask() {
            @Override
            public void run() {
              in.hashCode();
            }
          },
          10L);
    }
  }

  static void timerAndLatch(Timer timer, CountDownLatch done) throws InterruptedException {
    try (StringReader in = new StringReader("a")) {
      timer.schedule(
          new TimerTask() {
            @Override
            public void run() {
              in.hashCode();
              done.countDown();
            }
          },
          10L);
      done.await();
    }
  }

  static void completion(CompletionService<Integer> completion) {
    try (StringReader in = new StringReader("a")) {
      completion.submit(() -> in.read()); // violation: TaskOutlivesTryResource
    }
  }

  static int completionAndTake(CompletionService<Integer> completion) throws Exception {
    try (StringReader in = new StringReader("a")) {
      completion.submit(() -> in.read());
      return completion.take().get();
    }
  }

  static void completionAndPoll(CompletionService<Integer> completion) throws Exception {
    try (StringReader in = new StringReader("a")) {
      completion.submit(() -> in.read());
      completion.poll(1, TimeUnit.SECONDS);
    }
  }

  static void completionAndUntimedPoll(CompletionService<Integer> completion) {
    try (StringReader in = new StringReader("a")) {
      completion.submit(() -> in.read()); // violation: TaskOutlivesTryResource
      completion.poll();
    }
  }
}
