package nitpicker.host;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.io.PrintStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.net.MalformedURLException;
import java.net.URL;
import java.nio.charset.Charset;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.function.Consumer;
import java.util.spi.ToolProvider;
import nitpicker.host.io.JobStreams;
import nitpicker.host.io.ToolThreads;

final class JobRunner {
  static final String SEPARATOR = "\u001f";
  private static final int FIRST_ARGUMENT = 5;

  record Result(int code, byte[] out, byte[] err) {}

  private final Map<String, HostLoader> warm = new HashMap<>();
  private final Charset charset = outputCharset();

  Charset charset() {
    return charset;
  }

  private static Charset outputCharset() {
    for (String property : new String[] {"stdout.encoding", "native.encoding"}) {
      String name = System.getProperty(property);
      if (name != null) {
        try {
          return Charset.forName(name);
        } catch (RuntimeException unknown) {
          continue;
        }
      }
    }
    return Charset.defaultCharset();
  }

  Result run(List<String> request, Consumer<Result> reply, Runnable stop) {
    if (request.get(0).equals("tool")) {
      return runTool(request, reply, stop);
    }
    boolean fresh = request.get(1).equals("fresh");
    String main = request.get(2);
    String cwd = request.get(3);
    String classpath = request.get(4);
    String[] args = request.subList(FIRST_ARGUMENT, request.size()).toArray(new String[0]);
    HostLoader loader = loaderFor(classpath, fresh);
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    ByteArrayOutputStream err = new ByteArrayOutputStream();
    Properties properties = (Properties) System.getProperties().clone();
    Exit.reset(null, elsewhere(out, err, reply, stop));
    JobStreams.begin(out, err);
    ToolThreads.use(loader);
    try {
      applyProperties(classpath, cwd, main, args);
      int code = execute(loader, main, args);
      JobStreams.end();
      return new Result(code, out.toByteArray(), err.toByteArray());
    } finally {
      JobStreams.end();
      Exit.finish();
      System.setProperties(properties);
      if (fresh) {
        closeQuietly(loader);
      }
    }
  }

  private static Exit.Elsewhere elsewhere(
      ByteArrayOutputStream out, ByteArrayOutputStream err, Consumer<Result> reply, Runnable stop) {
    return (code, halt) -> {
      if (!halt) {
        runHooks();
      }
      JobStreams.end();
      reply.accept(new Result(code, out.toByteArray(), err.toByteArray()));
      stop.run();
    };
  }

  private Result runTool(List<String> request, Consumer<Result> reply, Runnable stop) {
    String name = request.get(2);
    String cwd = request.get(3);
    String stdoutFile = request.get(4);
    List<String> args = new ArrayList<>();
    Properties flags = new Properties();
    for (String argument : request.subList(FIRST_ARGUMENT, request.size())) {
      if (argument.startsWith("-J-D") && argument.indexOf('=') > 0) {
        int equals = argument.indexOf('=');
        flags.setProperty(argument.substring("-J-D".length(), equals), argument.substring(equals + 1));
      } else if (!argument.startsWith("-J")) {
        args.add(argument);
      }
    }
    ByteArrayOutputStream err = new ByteArrayOutputStream();
    ByteArrayOutputStream captured = new ByteArrayOutputStream();
    Properties properties = (Properties) System.getProperties().clone();
    Locale locale = Locale.getDefault();
    try (OutputStream sink = stdoutFile.isEmpty() ? captured : Files.newOutputStream(Path.of(stdoutFile))) {
      System.getProperties().putAll(flags);
      System.setProperty("user.dir", Path.of(cwd).toString());
      Locale.setDefault(new Locale(
          System.getProperty("user.language", locale.getLanguage()),
          System.getProperty("user.country", locale.getCountry())));
      PrintStream out = new PrintStream(sink, true, charset);
      PrintStream error = new PrintStream(err, true, charset);
      Exit.reset(Thread.currentThread(), elsewhere(captured, err, reply, stop));
      JobStreams.begin(sink, err);
      ToolThreads.use(null);
      int code = ToolProvider.findFirst(name)
          .map(tool -> tool.run(out, error, args.toArray(new String[0])))
          .orElseGet(() -> {
            error.println("No tool named " + name + " in this JDK");
            return 1;
          });
      out.flush();
      error.flush();
      return new Result(code, captured.toByteArray(), err.toByteArray());
    } catch (IOException failure) {
      return new Result(1, new byte[0], String.valueOf(failure).getBytes(charset));
    } finally {
      JobStreams.end();
      Exit.finish();
      System.setProperties(properties);
      Locale.setDefault(locale);
    }
  }

  private static void applyProperties(String classpath, String cwd, String main, String[] args) {
    System.setProperty("java.class.path", String.join(File.pathSeparator, classpath.split(SEPARATOR)));
    System.setProperty("user.dir", Path.of(cwd).toString());
    System.setProperty("sun.java.command", main + " " + String.join(" ", args));
  }

  private HostLoader loaderFor(String classpath, boolean fresh) {
    if (fresh) {
      return newLoader(classpath);
    }
    synchronized (warm) {
      return warm.computeIfAbsent(classpath, JobRunner::newLoader);
    }
  }

  private static HostLoader newLoader(String classpath) {
    List<URL> urls = new ArrayList<>();
    for (String entry : classpath.split(SEPARATOR)) {
      if (entry.isEmpty()) {
        continue;
      }
      try {
        urls.add(Path.of(entry).toUri().toURL());
      } catch (MalformedURLException broken) {
        throw new IllegalArgumentException(entry, broken);
      }
    }
    return new HostLoader(urls.toArray(new URL[0]));
  }

  private static void closeQuietly(HostLoader loader) {
    try {
      loader.close();
    } catch (IOException ignored) {
      return;
    }
  }

  private int execute(HostLoader loader, String main, String[] args) {
    ThreadGroup group = new ThreadGroup("tool-job");
    int[] failure = {0};
    Thread thread = new Thread(group, () -> failure[0] = invoke(loader, main, args), "main", 0);
    thread.setContextClassLoader(loader);
    Exit.useThread(thread);
    thread.start();
    joinAll(thread, group);
    if (!Exit.halted()) {
      runHooks();
    }
    Integer requested = Exit.requested();
    return requested != null ? requested : failure[0];
  }

  private static int invoke(HostLoader loader, String main, String[] args) {
    try {
      Class<?> type = Class.forName(main, true, loader);
      Method method = type.getMethod("main", String[].class);
      method.invoke(null, (Object) args);
      return 0;
    } catch (ClassNotFoundException | NoSuchMethodException missing) {
      System.err.println("Error: Could not find or load main class " + main);
      return 1;
    } catch (InvocationTargetException failed) {
      return report(failed.getCause());
    } catch (Throwable other) {
      return report(other);
    }
  }

  private static int report(Throwable failure) {
    if (failure instanceof Exit.ToolExit exit) {
      return exit.code();
    }
    System.err.print("Exception in thread \"main\" ");
    failure.printStackTrace(System.err);
    return 1;
  }

  private static void joinAll(Thread main, ThreadGroup group) {
    try {
      main.join();
      boolean waiting = true;
      while (waiting) {
        waiting = false;
        Thread[] threads = new Thread[group.activeCount() + 8];
        int count = group.enumerate(threads, true);
        for (int index = 0; index < count; index++) {
          if (threads[index].isAlive() && !threads[index].isDaemon()) {
            threads[index].join();
            waiting = true;
          }
        }
      }
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
    }
  }

  private static void runHooks() {
    List<Thread> hooks = Exit.hooks();
    for (Thread hook : hooks) {
      hook.start();
    }
    for (Thread hook : hooks) {
      try {
        hook.join();
      } catch (InterruptedException interrupted) {
        Thread.currentThread().interrupt();
      }
    }
  }
}
