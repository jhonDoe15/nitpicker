package nitpicker.host.io;

import java.util.concurrent.ForkJoinPool;
import java.util.concurrent.ForkJoinWorkerThread;

public final class ToolThreads implements ForkJoinPool.ForkJoinWorkerThreadFactory {
  public static final String FACTORY_PROPERTY =
      "java.util.concurrent.ForkJoinPool.common.threadFactory";
  private static volatile ClassLoader current;

  public static void use(ClassLoader loader) {
    current = loader;
  }

  public static void install() {
    System.setProperty(FACTORY_PROPERTY, ToolThreads.class.getName());
  }

  @Override
  public ForkJoinWorkerThread newThread(ForkJoinPool pool) {
    ForkJoinWorkerThread thread = ForkJoinPool.defaultForkJoinWorkerThreadFactory.newThread(pool);
    ClassLoader loader = current;
    if (loader != null) {
      thread.setContextClassLoader(loader);
    }
    return thread;
  }
}
