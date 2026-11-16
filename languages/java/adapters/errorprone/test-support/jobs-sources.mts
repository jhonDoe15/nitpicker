export const JOBS = `package demo;

import java.util.concurrent.ExecutorService;

public final class Jobs {
  private final ExecutorService executor;

  public Jobs(ExecutorService executor) {
    this.executor = executor;
  }

  public void start() {
    executor.submit(this::count);
  }

  @SuppressWarnings("CheckReturnValue")
  public void restart() {
    count();
  }

  public int count() {
    return 1;
  }

  public String name() {
    return null;
  }
}
`;

export const JOBS_CHECK = `package demo;

import demo.samples.Samples;

final class JobsCheck {
  void run(Jobs jobs) {
    jobs.count();
    Samples.make();
    new Jobs(null).start();
  }
}
`;

export const SAMPLES = `package demo.samples;

public final class Samples {
  private Samples() {}

  public static int make() {
    return 1;
  }
}
`;
