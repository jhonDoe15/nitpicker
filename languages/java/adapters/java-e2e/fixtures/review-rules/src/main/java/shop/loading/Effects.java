package shop.loading;

import static java.nio.file.Files.exists;

import java.nio.file.Path;
import java.util.concurrent.ForkJoinPool;
import java.util.concurrent.RecursiveTask;

public final class Effects {
  static final boolean CONFIGURED = exists(Path.of("effects.conf")); // violation: ClassLoadEffect
  static final boolean ALL = allExist("a.conf", "b.conf");

  static {
    ForkJoinPool.commonPool().submit(() -> CONFIGURED); // violation: ClassLoadEffect
    ForkJoinPool.commonPool().invoke(new Count()); // violation: ClassLoadEffect
    pause();
    if (Boolean.getBoolean("effects.abort")) {
      System.exit(2);
    }
  }

  private Effects() {}

  private static boolean allExist(String... files) {
    boolean all = true;
    for (String file : files) {
      all &= exists(Path.of(file)); // violation: ClassLoadEffect
    }
    return all;
  }

  private static void pause() {
    try {
      Thread.sleep(10); // violation: ClassLoadEffect
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
    }
  }

  private static final class Count extends RecursiveTask<Integer> {
    @Override
    protected Integer compute() {
      return 1;
    }
  }
}
