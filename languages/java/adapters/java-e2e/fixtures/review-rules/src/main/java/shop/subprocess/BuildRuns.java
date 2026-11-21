package shop.subprocess;

import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.TimeUnit;

public final class BuildRuns {
  private BuildRuns() {}

  public static int gradle(File project) throws IOException, InterruptedException {
    Process process = new ProcessBuilder("gradlew.bat", "check").directory(project).inheritIO().start();
    if (!process.waitFor(15, TimeUnit.MINUTES)) {
      process.destroyForcibly(); // violation: DestroyLeavesDescendants
      return -1;
    }
    return process.exitValue();
  }

  public static int script(File project) throws IOException, InterruptedException {
    Process process = new ProcessBuilder(List.of("sh", "-c", "make && make test")).directory(project).start();
    if (!process.waitFor(15, TimeUnit.MINUTES)) {
      process.destroy(); // violation: DestroyLeavesDescendants
      return -1;
    }
    return process.exitValue();
  }

  public static int npm(File project) throws IOException, InterruptedException {
    Process process = new ProcessBuilder("npm", "run", "build").directory(project).start();
    if (!process.waitFor(15, TimeUnit.MINUTES)) {
      process.descendants().forEach(ProcessHandle::destroyForcibly);
      process.destroyForcibly();
      return -1;
    }
    return process.exitValue();
  }

  public static int git(File project) throws IOException, InterruptedException {
    Process process = new ProcessBuilder("git", "status").directory(project).inheritIO().start();
    if (!process.waitFor(1, TimeUnit.MINUTES)) {
      process.destroyForcibly();
      return -1;
    }
    return process.exitValue();
  }
}
