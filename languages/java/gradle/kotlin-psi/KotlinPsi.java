package nitpicker.kotlinpsi;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.PatternSyntaxException;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import nitpicker.kotlinpsi.bodies.Throwing;
import nitpicker.kotlinpsi.common.Json;
import nitpicker.kotlinpsi.design.DesignFacts;
import nitpicker.kotlinpsi.design.Source;
import nitpicker.kotlinpsi.facts.FactsCollector;
import nitpicker.kotlinpsi.metrics.FileClasses;
import nitpicker.kotlinpsi.metrics.MetricsCollector;
import nitpicker.kotlinpsi.metrics.Types;
import org.jetbrains.kotlin.cli.FrontendConfigurationKeysKt;
import org.jetbrains.kotlin.cli.common.messages.MessageCollector;
import org.jetbrains.kotlin.cli.jvm.compiler.EnvironmentConfigFiles;
import org.jetbrains.kotlin.cli.jvm.compiler.KotlinCoreEnvironment;
import org.jetbrains.kotlin.com.intellij.openapi.Disposable;
import org.jetbrains.kotlin.com.intellij.openapi.util.Disposer;
import org.jetbrains.kotlin.com.intellij.psi.PsiErrorElement;
import org.jetbrains.kotlin.com.intellij.psi.PsiFileFactory;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.compiler.plugin.CompilerPluginRegistrar;
import org.jetbrains.kotlin.config.CommonConfigurationKeys;
import org.jetbrains.kotlin.config.CompilerConfiguration;
import org.jetbrains.kotlin.idea.KotlinLanguage;
import org.jetbrains.kotlin.psi.KtFile;

/**
 * Parses the Kotlin sources of a module once with the PSI parser of the pinned Kotlin compiler (it never
 * compiles them) and writes both reports of the Kotlin preset:
 *
 * <pre>java -Dnitpicker.kotlinCompiler=VERSION -cp COMPILER_JARS:CLASSES nitpicker.kotlinpsi.KotlinPsi
 *     METRICS.json FACTS.json PROJECT_DIR ROOT...</pre>
 *
 * A root prefixed {@code test:} holds test sources. The metrics report (functions, class names and types, see
 * {@link MetricsCollector} and {@link Types}) covers the other roots only; the facts report
 * ({@link FactsCollector}) covers all. The facts report also carries a {@code design} key: the design facts
 * of the production roots ({@link DesignFacts}), resolved by name without a type checker.
 * A syntax error ends the run: the sources compiled, so the pinned compiler does not read them.
 */
public final class KotlinPsi {
  private static final String TEST_PREFIX = "test:";
  private static final long STACK_BYTES = 1L << 29;

  private KotlinPsi() {}

  public static void main(String[] args) throws Exception {
    Throwable[] failure = new Throwable[1];
    Thread worker =
        new Thread(
            null,
            () -> {
              try {
                run(args);
              } catch (Throwable thrown) {
                failure[0] = thrown;
              }
            },
            "kotlin-psi",
            STACK_BYTES);
    worker.start();
    worker.join();
    if (failure[0] != null) {
      System.err.println("KotlinPsi failed: " + failure[0]);
      System.exit(1);
    }
  }

  private static void run(String[] args) throws IOException {
    Path metricsOutput = Path.of(args[0]);
    Path factsOutput = Path.of(args[1]);
    Path projectDir = Path.of(args[2]).toAbsolutePath().normalize();
    Map<Path, Boolean> files = sources(projectDir, List.of(args).subList(3, args.length));
    List<String> functions = new ArrayList<>();
    List<String> classes = new ArrayList<>();
    List<String> types = new ArrayList<>();
    List<Object> facts = new ArrayList<>();
    List<Source> production = new ArrayList<>();
    Object design;
    Set<String> claimedFacades = new HashSet<>();
    Disposable disposable = Disposer.newDisposable();
    try {
      PsiFileFactory factory = PsiFileFactory.getInstance(environment(disposable).getProject());
      List<Parsed> sources = new ArrayList<>();
      for (Map.Entry<Path, Boolean> source : files.entrySet()) {
        Path file = source.getKey();
        boolean test = source.getValue();
        String relative = projectDir.relativize(file.toAbsolutePath().normalize()).toString().replace('\\', '/');
        String text = normalized(Files.readString(file, StandardCharsets.UTF_8));
        sources.add(new Parsed(parse(factory, file, text, relative, test), text, relative, test));
      }
      Set<String> nothing = Throwing.nothingFunctions(
          sources.stream().filter(source -> !source.test()).map(Parsed::parsed).toList());
      for (Parsed source : sources) {
        if (!source.test()) {
          new MetricsCollector(source.parsed(), source.text(), source.relative(), functions).collect();
          classes.add(FileClasses.describe(source.parsed(), source.relative(), claimedFacades));
          Types.collect(source.parsed(), source.text(), source.relative(), types);
          production.add(new Source(source.parsed(), source.relative(), source.text()));
        }
        facts.add(factsOf(source, nothing));
      }
      design = designOf(production);
    } finally {
      Disposer.dispose(disposable);
    }
    Files.writeString(
        metricsOutput,
        "{\"functions\":[" + String.join(",", functions) + "],\"files\":[" + String.join(",", classes)
            + "],\"types\":[" + String.join(",", types) + "]}\n",
        StandardCharsets.UTF_8);
    Map<String, Object> report = new LinkedHashMap<>();
    report.put("files", facts);
    report.put("design", design);
    Files.writeString(factsOutput, Json.of(report) + "\n", StandardCharsets.UTF_8);
  }

  private record Parsed(KtFile parsed, String text, String relative, boolean test) {}

  private static Object factsOf(Parsed source, Set<String> nothing) {
    try {
      FactsCollector collector =
          new FactsCollector(source.parsed(), source.text(), source.relative(), source.test(), nothing);
      collector.collect();
      return collector.result();
    } catch (StackOverflowError tooDeep) {
      return skipped(source.relative(), source.test());
    } catch (PatternSyntaxException failed) {
      if (!failed.getDescription().startsWith("Stack overflow")) {
        throw failed;
      }
      return skipped(source.relative(), source.test());
    }
  }

  private static Object designOf(List<Source> production) {
    try {
      return DesignFacts.build(production);
    } catch (RuntimeException | StackOverflowError failed) {
      System.err.println("design facts failed: " + failed);
      return Map.of("error", String.valueOf(failed));
    }
  }

  private static Object skipped(String relative, boolean test) {
    System.err.println(relative + ": too deeply nested to collect review facts; the file is skipped");
    return Map.of("file", relative, "test", test, "skipped", true);
  }

  private static Map<Path, Boolean> sources(Path projectDir, List<String> roots) throws IOException {
    Map<Path, Boolean> files = new LinkedHashMap<>();
    for (String argument : roots) {
      boolean test = argument.startsWith(TEST_PREFIX);
      Path root = projectDir.resolve(test ? argument.substring(TEST_PREFIX.length()) : argument);
      if (Files.isDirectory(root)) {
        try (Stream<Path> walk = Files.walk(root)) {
          for (Path file : walk.filter(p -> p.toString().endsWith(".kt")).sorted().collect(Collectors.toList())) {
            files.putIfAbsent(file, test);
          }
        }
      }
    }
    return files;
  }

  private static KotlinCoreEnvironment environment(Disposable disposable) {
    CompilerConfiguration configuration = new CompilerConfiguration();
    configuration.put(CommonConfigurationKeys.MESSAGE_COLLECTOR_KEY, MessageCollector.Companion.getNONE());
    FrontendConfigurationKeysKt.setExtensionsStorage(configuration, new CompilerPluginRegistrar.ExtensionStorage());
    return KotlinCoreEnvironment.createForProduction(
        disposable, configuration, EnvironmentConfigFiles.JVM_CONFIG_FILES);
  }

  private static String advice(boolean test) {
    String compiler = System.getProperty("nitpicker.kotlinCompiler", "(unknown)");
    return test
        ? "This test source is not compiled by this step: either it is not valid Kotlin, or the pinned Kotlin compiler "
            + compiler + " is too old to read it (bump kotlinCompiler in nitpicker.init.gradle)."
        : "The sources compile, so the pinned Kotlin compiler " + compiler
            + " is too old to read them: bump kotlinCompiler in nitpicker.init.gradle.";
  }

  private static String normalized(String raw) {
    String text = raw.startsWith("﻿") ? raw.substring(1) : raw;
    return text.replace("\r\n", "\n").replace('\r', '\n');
  }

  private static KtFile parse(
      PsiFileFactory factory, Path file, String text, String relative, boolean test) {
    KtFile parsed = (KtFile) factory.createFileFromText(file.getFileName().toString(), KotlinLanguage.INSTANCE, text);
    PsiErrorElement error = PsiTreeUtil.findChildOfType(parsed, PsiErrorElement.class);
    if (error != null) {
      int line = text.substring(0, Math.min(error.getTextOffset(), text.length())).split("\n", -1).length;
      System.err.println(relative + ":" + line + ": " + error.getErrorDescription() + ". " + advice(test));
      System.exit(1);
    }
    return parsed;
  }
}
