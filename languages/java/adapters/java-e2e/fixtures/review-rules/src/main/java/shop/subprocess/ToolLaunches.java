package shop.subprocess;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

public final class ToolLaunches {
  private ToolLaunches() {}

  public static ProcessBuilder inline(List<String> classpath, String mainClass) {
    return new ProcessBuilder(
        "java", "-cp", String.join(File.pathSeparator, classpath), mainClass); // violation: GrowingProcessArguments
  }

  public static ProcessBuilder built(List<File> jars, String mainClass) {
    String path =
        jars.stream().map(File::getPath).collect(Collectors.joining(File.pathSeparator)); // violation: GrowingProcessArguments
    List<String> command = new ArrayList<>();
    command.add("java");
    command.add("-cp");
    command.add(path);
    command.add(mainClass);
    return new ProcessBuilder(command);
  }

  public static ProcessBuilder throughEnvironment(List<String> classpath, String mainClass) {
    ProcessBuilder builder = new ProcessBuilder("java", mainClass);
    builder.environment().put("CLASSPATH", String.join(File.pathSeparator, classpath));
    return builder;
  }

  public static ProcessBuilder argumentFile(File argsFile, String mainClass) {
    return new ProcessBuilder("java", "@" + argsFile.getPath(), mainClass);
  }
}
