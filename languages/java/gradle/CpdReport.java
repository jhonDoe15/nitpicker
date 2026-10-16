import java.io.IOException;
import java.io.UncheckedIOException;
import java.io.Writer;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileSystemLoopException;
import java.nio.file.FileVisitOption;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;
import net.sourceforge.pmd.cpd.CPDConfiguration;
import net.sourceforge.pmd.cpd.CPDReport;
import net.sourceforge.pmd.cpd.CpdAnalysis;
import net.sourceforge.pmd.cpd.XMLRenderer;
import net.sourceforge.pmd.lang.LanguageRegistry;
import net.sourceforge.pmd.lang.document.FileId;

public final class CpdReport {
    private static final Pattern CLASS_LITERAL =
        Pattern.compile("\\.((?:\\s|/\\*.*?\\*/|//[^\\n]*\\n)*)class(?![\\w$])", Pattern.DOTALL);
    private static final int MINIMUM_TOKENS = 100;

    private CpdReport() {
    }

    public static void main(String[] args) throws IOException {
        CPDConfiguration config = new CPDConfiguration();
        config.setMinimumTileSize(MINIMUM_TOKENS);
        config.setIgnoreIdentifiers(true);
        config.setIgnoreLiterals(true);
        config.setFailOnError(false);
        config.setOnlyRecognizeLanguage(LanguageRegistry.CPD.getLanguageById("java"));
        Path report = Path.of(args[0]);
        XMLRenderer renderer = new XMLRenderer(config.getSourceEncoding().name());
        AtomicBoolean reported = new AtomicBoolean();
        try (CpdAnalysis cpd = CpdAnalysis.create(config)) {
            for (Path file : sourceFiles(Arrays.copyOfRange(args, 1, args.length))) {
                addSource(cpd, file);
            }
            cpd.performAnalysis(result -> reported.set(write(renderer, result, report)));
        }
        if (!reported.get()) {
            System.exit(1);
        }
    }

    private static boolean write(XMLRenderer renderer, CPDReport result, Path report) {
        try (Writer writer = Files.newBufferedWriter(report, Charset.defaultCharset())) {
            renderer.render(result, writer);
            return true;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static List<Path> sourceFiles(String[] directories) throws IOException {
        List<Path> files = new ArrayList<>();
        for (String directory : directories) {
            Files.walkFileTree(Path.of(directory), EnumSet.of(FileVisitOption.FOLLOW_LINKS), Integer.MAX_VALUE,
                new SimpleFileVisitor<>() {
                    @Override
                    public FileVisitResult visitFile(Path file, BasicFileAttributes attributes) {
                        if (attributes.isRegularFile() && file.toString().endsWith(".java")) {
                            files.add(file);
                        }
                        return FileVisitResult.CONTINUE;
                    }

                    @Override
                    public FileVisitResult visitFileFailed(Path file, IOException e) {
                        String reason = e instanceof FileSystemLoopException ? "symbolic link loop" : e.toString();
                        System.err.println("CPD skipped " + file + ": " + reason);
                        return FileVisitResult.CONTINUE;
                    }
                });
        }
        files.sort(null);
        return files;
    }

    private static void addSource(CpdAnalysis cpd, Path file) {
        try {
            String text = new String(Files.readAllBytes(file), StandardCharsets.UTF_8);
            String safe = CLASS_LITERAL.matcher(text).replaceAll(".$1const");
            cpd.files().addSourceFile(FileId.fromPath(file), safe);
        } catch (IOException e) {
            System.err.println("CPD skipped " + file + ": " + e);
        }
    }
}
