package memory;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;

public class Workers {
  public void each(List<String> modules) throws IOException {
    for (String module : modules) {
      new ProcessBuilder("java", "-Xmx2g", "-jar", "tool.jar", module).start();
    }
  }

  public void withGoal(List<String> modules) throws IOException {
    for (String module : modules) {
      new ProcessBuilder("java", "-Xmx2g", "-XX:GCTimeRatio=4", "-jar", "tool.jar", module).start();
    }
  }

  public void once(String module) throws IOException {
    new ProcessBuilder("java", "-Xmx2g", "-jar", "tool.jar", module).start();
  }

  public void pooled(ExecutorService pool, List<String> modules) {
    modules.forEach(module -> pool.submit(() -> run(module)));
  }

  private Process run(String module) throws IOException {
    List<String> command = new ArrayList<>();
    command.add("/usr/lib/jvm/bin/java");
    command.add("-XX:MaxRAMPercentage=50");
    command.add(module);
    return new ProcessBuilder(command).start();
  }

  public void streamed(List<String> modules) {
    modules.parallelStream().forEach(module -> {
      try {
        Runtime.getRuntime().exec(new String[] {"java", "-Xmx1g", "-cp", module, "Main"});
      } catch (IOException e) {
        throw new IllegalStateException(e);
      }
    });
  }

  public void environment(List<String> modules) throws IOException {
    for (String module : modules) {
      ProcessBuilder builder = new ProcessBuilder("tool", module);
      builder.environment().put("JAVA_TOOL_OPTIONS", "-Xmx512m");
      builder.start();
    }
  }

  public void environmentWithGoal(List<String> modules) throws IOException {
    for (String module : modules) {
      ProcessBuilder builder = new ProcessBuilder("tool", module);
      builder.environment().put("JDK_JAVA_OPTIONS", "-Xmx512m -XX:SoftMaxHeapSize=256m");
      builder.start();
    }
  }

  public void notJava(List<String> modules) throws IOException {
    for (String module : modules) {
      new ProcessBuilder("node", "--max-old-space-size=2048", module).start();
    }
  }

  public void oneString(List<String> jars) throws IOException {
    for (String jar : jars) {
      Runtime.getRuntime().exec("java -Xmx2g -jar " + jar);
    }
  }

  public void otherRun(List<Workers> others) throws IOException {
    for (Workers other : others) {
      other.launch("tool.jar");
    }
  }

  public Process launch(String jar) throws IOException {
    return new ProcessBuilder("java", "-Xmx512m", "-jar", jar).start();
  }
}
