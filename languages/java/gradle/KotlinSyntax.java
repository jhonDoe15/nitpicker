// Syntax trees of the Kotlin sources that use Spring or JPA, for the Kotlin Spring rules
// (languages/java/adapters/kotlin/spring/). Run in the JDK's single-file source mode with the Kotlin
// compiler on the class path, which parses (never compiles) the sources with the compiler's own PSI parser:
//
//   java -Dnitpicker.kotlinCompiler=<version> -cp <kotlin-compiler-embeddable and dependencies> KotlinSyntax.java <output.json> <projectDir> <sourceRoot>...
//
// Output: {"files": [{"file": "<path relative to projectDir>", "tree": <node>}]} for every .kt file under the
// source roots that mentions org.springframework, jakarta.persistence, javax.persistence or org.hibernate. A node is
// {"t": <element type>, "s": <start offset>, "e": <end offset>, "c": [<child nodes>]}; leaves have no "c", and
// neither do the package and import directives, whose text the reader parses. White space and comments are left out. The offsets index the file text after the byte order mark is dropped and line
// endings are turned into \n, which is how the reader normalizes the text it slices them from. A syntax error ends
// the run: the sources compiled, so the pinned compiler does not read them.

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.stream.*;
import org.jetbrains.kotlin.cli.FrontendConfigurationKeysKt;
import org.jetbrains.kotlin.cli.common.messages.MessageCollector;
import org.jetbrains.kotlin.compiler.plugin.CompilerPluginRegistrar;
import org.jetbrains.kotlin.cli.jvm.compiler.EnvironmentConfigFiles;
import org.jetbrains.kotlin.cli.jvm.compiler.KotlinCoreEnvironment;
import org.jetbrains.kotlin.com.intellij.lang.ASTNode;
import org.jetbrains.kotlin.com.intellij.openapi.Disposable;
import org.jetbrains.kotlin.com.intellij.openapi.util.Disposer;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.PsiErrorElement;
import org.jetbrains.kotlin.com.intellij.psi.PsiFileFactory;
import org.jetbrains.kotlin.com.intellij.psi.PsiWhiteSpace;
import org.jetbrains.kotlin.com.intellij.psi.PsiComment;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.config.CommonConfigurationKeys;
import org.jetbrains.kotlin.config.CompilerConfiguration;
import org.jetbrains.kotlin.idea.KotlinLanguage;
import org.jetbrains.kotlin.psi.KtFile;

public final class KotlinSyntax {
  private static final Set<String> LEAVES = Set.of("PACKAGE_DIRECTIVE", "IMPORT_DIRECTIVE");
  private static final List<String> MARKERS = List.of("org.springframework", "jakarta.persistence", "javax.persistence", "org.hibernate");

  public static void main(String[] args) throws IOException {
    Path output = Path.of(args[0]);
    Path projectDir = Path.of(args[1]).toAbsolutePath().normalize();
    List<Path> files = new ArrayList<>();
    for (int i = 2; i < args.length; i++) {
      Path root = projectDir.resolve(args[i]);
      if (Files.isDirectory(root)) {
        try (Stream<Path> walk = Files.walk(root)) {
          walk.filter(p -> p.toString().endsWith(".kt")).sorted().forEach(files::add);
        }
      }
    }
    List<String> entries = new ArrayList<>();
    Disposable disposable = Disposer.newDisposable();
    try {
      CompilerConfiguration configuration = new CompilerConfiguration();
      configuration.put(CommonConfigurationKeys.MESSAGE_COLLECTOR_KEY, MessageCollector.Companion.getNONE());
      FrontendConfigurationKeysKt.setExtensionsStorage(
          configuration, new CompilerPluginRegistrar.ExtensionStorage());
      KotlinCoreEnvironment environment =
          KotlinCoreEnvironment.createForProduction(
              disposable, configuration, EnvironmentConfigFiles.JVM_CONFIG_FILES);
      PsiFileFactory factory = PsiFileFactory.getInstance(environment.getProject());
      for (Path file : files.stream().distinct().collect(Collectors.toList())) {
        String relative =
            projectDir.relativize(file.toAbsolutePath().normalize()).toString().replace('\\', '/');
        String text = normalized(Files.readString(file, StandardCharsets.UTF_8));
        if (MARKERS.stream().noneMatch(text::contains)) {
          continue;
        }
        KtFile ktFile =
            (KtFile)
                factory.createFileFromText(file.getFileName().toString(), KotlinLanguage.INSTANCE, text);
        PsiErrorElement error = PsiTreeUtil.findChildOfType(ktFile, PsiErrorElement.class);
        if (error != null) {
          int line = text.substring(0, Math.min(error.getTextOffset(), text.length())).split("\n", -1).length;
          System.err.println(
              relative + ":" + line + ": " + error.getErrorDescription() + ". The sources compile, so the pinned"
                  + " Kotlin compiler " + System.getProperty("nitpicker.kotlinCompiler", "(unknown)")
                  + " is too old to read them: bump kotlinCompiler in nitpicker.init.gradle.");
          System.exit(1);
        }
        StringBuilder tree = new StringBuilder();
        write(ktFile.getNode(), tree);
        entries.add("{\"file\":\"" + relative.replace("\\", "\\\\").replace("\"", "\\\"") + "\",\"tree\":" + tree + "}");
      }
    } finally {
      Disposer.dispose(disposable);
    }
    Files.writeString(output, "{\"files\":[" + String.join(",", entries) + "]}\n", StandardCharsets.UTF_8);
  }

  private static String normalized(String raw) {
    String text = raw.startsWith("﻿") ? raw.substring(1) : raw;
    return text.replace("\r\n", "\n").replace('\r', '\n');
  }

  private static void write(ASTNode node, StringBuilder out) {
    out.append("{\"t\":\"").append(node.getElementType()).append("\",\"s\":").append(node.getStartOffset())
        .append(",\"e\":").append(node.getStartOffset() + node.getTextLength());
    List<ASTNode> children = new ArrayList<>();
    String type = node.getElementType().toString();
    for (ASTNode child = node.getFirstChildNode(); child != null; child = child.getTreeNext()) {
      PsiElement psi = child.getPsi();
      if (!LEAVES.contains(type) && !(psi instanceof PsiWhiteSpace) && !(psi instanceof PsiComment)) {
        children.add(child);
      }
    }
    if (!children.isEmpty()) {
      out.append(",\"c\":[");
      for (int i = 0; i < children.size(); i++) {
        if (i > 0) {
          out.append(',');
        }
        write(children.get(i), out);
      }
      out.append(']');
    }
    out.append('}');
  }
}
