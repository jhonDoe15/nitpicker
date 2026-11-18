package nitpicker.host;

import java.util.ArrayList;
import java.util.List;

public final class Exit {
  public interface Elsewhere {
    void exited(int code, boolean halt);
  }

  private static Integer requested;
  private static boolean halted;
  private static volatile Thread jobThread;
  private static volatile Elsewhere elsewhere;
  private static final List<Thread> HOOKS = new ArrayList<>();

  private Exit() {}

  public static final class ToolExit extends Error {
    private static final long serialVersionUID = 1L;
    private final int code;

    ToolExit(int code) {
      super("exit " + code, null, false, false);
      this.code = code;
    }

    public int code() {
      return code;
    }
  }

  public static void exit(int code) {
    terminate(code, false);
  }

  public static void exit(Runtime runtime, int code) {
    terminate(code, false);
  }

  public static void halt(Runtime runtime, int code) {
    terminate(code, true);
  }

  private static void terminate(int code, boolean halt) {
    synchronized (Exit.class) {
      if (requested == null) {
        requested = code;
        halted = halt;
      }
    }
    Thread main = jobThread;
    Elsewhere handler = elsewhere;
    if (main != null && handler != null && Thread.currentThread() != main) {
      handler.exited(code, halt);
    }
    throw new ToolExit(code);
  }

  public static synchronized void addHook(Runtime runtime, Thread hook) {
    if (HOOKS.contains(hook)) {
      throw new IllegalArgumentException("Hook previously registered");
    }
    HOOKS.add(hook);
  }

  public static synchronized boolean removeHook(Runtime runtime, Thread hook) {
    return HOOKS.remove(hook);
  }

  static synchronized void reset(Thread thread, Elsewhere handler) {
    requested = null;
    halted = false;
    HOOKS.clear();
    jobThread = thread;
    elsewhere = handler;
  }

  static synchronized void finish() {
    jobThread = null;
    elsewhere = null;
  }

  static void useThread(Thread thread) {
    jobThread = thread;
  }

  static synchronized Integer requested() {
    return requested;
  }

  static synchronized boolean halted() {
    return halted;
  }

  static synchronized List<Thread> hooks() {
    return new ArrayList<>(HOOKS);
  }
}
