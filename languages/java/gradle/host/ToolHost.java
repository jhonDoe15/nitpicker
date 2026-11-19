package nitpicker.host;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.StandardProtocolFamily;
import java.net.UnixDomainSocketAddress;
import java.nio.channels.Channels;
import java.nio.channels.ServerSocketChannel;
import java.nio.channels.SocketChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.FileTime;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;
import nitpicker.host.io.JobStreams;
import nitpicker.host.io.ToolThreads;

public final class ToolHost {
  private static final long WATCH_MILLIS = 1000;

  private final Path directory;
  private final String key;
  private final long owner;
  private final JobRunner runner = new JobRunner();
  private final AtomicBoolean busy = new AtomicBoolean();

  private ToolHost(Path directory, String key, long owner) {
    this.directory = directory;
    this.key = key;
    this.owner = owner;
  }

  public static void main(String[] args) throws IOException {
    ToolThreads.install();
    ToolHost host = new ToolHost(Path.of(args[0]), args[1], Long.parseLong(args[2]));
    host.serve();
  }

  private Path file(String suffix) {
    return directory.resolve(key + suffix);
  }

  private void serve() throws IOException {
    Files.deleteIfExists(file(".sock"));
    try (ServerSocketChannel server = ServerSocketChannel.open(StandardProtocolFamily.UNIX)) {
      server.bind(UnixDomainSocketAddress.of(file(".sock")));
      Files.setPosixFilePermissions(file(".sock"), PosixFilePermissions.fromString("rw-------"));
      JobStreams.install(runner.charset());
      Runtime.getRuntime().addShutdownHook(new Thread(this::cleanUp));
      startWatchdog();
      Path staging = file(".ready.tmp");
      Files.writeString(staging, Long.toString(ProcessHandle.current().pid()), StandardCharsets.UTF_8);
      Files.move(staging, file(".ready"), StandardCopyOption.REPLACE_EXISTING);
      while (true) {
        SocketChannel connection = server.accept();
        Thread handler = new Thread(() -> handle(connection), "host-connection");
        handler.setDaemon(true);
        handler.start();
      }
    }
  }

  private void startWatchdog() {
    Thread watchdog = new Thread(() -> {
      while (ownerAlive() && Files.exists(directory)) {
        try {
          Thread.sleep(WATCH_MILLIS);
        } catch (InterruptedException interrupted) {
          return;
        }
      }
      cleanUp();
      Runtime.getRuntime().halt(0);
    }, "host-watchdog");
    watchdog.setDaemon(true);
    watchdog.start();
  }

  private boolean ownerAlive() {
    return ProcessHandle.of(owner).map(ProcessHandle::isAlive).orElse(false);
  }

  private void cleanUp() {
    for (String suffix : new String[] {".sock", ".ready", ".busy"}) {
      try {
        Files.deleteIfExists(file(suffix));
      } catch (IOException ignored) {
        continue;
      }
    }
  }

  private void handle(SocketChannel connection) {
    try (connection) {
      InputStream in = Channels.newInputStream(connection);
      OutputStream out = Channels.newOutputStream(connection);
      List<String> request = Wire.readStrings(in);
      String operation = request.get(0);
      if (operation.equals("ping")) {
        Wire.writeStrings(out, "pong");
      } else if (!busy.compareAndSet(false, true)) {
        Wire.writeStrings(out, "busy");
      } else {
        runJob(request, out);
      }
    } catch (IOException | RuntimeException failed) {
      return;
    }
  }

  private void runJob(List<String> request, OutputStream out) throws IOException {
    AtomicBoolean answered = new AtomicBoolean();
    Consumer<JobRunner.Result> reply = result -> {
      if (answered.compareAndSet(false, true)) {
        try {
          Wire.write(out, List.of(
              Integer.toString(result.code()).getBytes(StandardCharsets.UTF_8),
              result.out(), result.err()));
        } catch (IOException gone) {
          return;
        }
      }
    };
    Runnable stop = () -> {
      cleanUp();
      Runtime.getRuntime().halt(0);
    };
    JobRunner.Result result;
    try {
      Files.writeString(file(".busy"), "1");
      Wire.writeStrings(out, "started");
      result = runner.run(request, reply, stop);
    } catch (RuntimeException | LinkageError failure) {
      result = new JobRunner.Result(
          1, new byte[0], String.valueOf(failure).getBytes(StandardCharsets.UTF_8));
    } finally {
      Files.deleteIfExists(file(".busy"));
      busy.set(false);
    }
    reply.accept(result);
    touch();
    System.gc();
  }

  private void touch() {
    try {
      Files.setLastModifiedTime(file(".ready"), FileTime.fromMillis(System.currentTimeMillis()));
    } catch (IOException ignored) {
      return;
    }
  }
}
