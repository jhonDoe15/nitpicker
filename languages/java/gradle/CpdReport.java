import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import net.sourceforge.pmd.cpd.CPDConfiguration;
import net.sourceforge.pmd.cpd.CpdAnalysis;
import net.sourceforge.pmd.lang.LanguageRegistry;
import net.sourceforge.pmd.lang.document.FileId;

public final class CpdReport {
    private static final Pattern CLASS_LITERAL = Pattern.compile("\\.(\\s*)class(?![\\w$])");
    private static final int MINIMUM_TOKENS = 100;

    private CpdReport() {
    }

    public static void main(String[] args) throws IOException {
        CPDConfiguration config = new CPDConfiguration();
        config.setMinimumTileSize(MINIMUM_TOKENS);
        config.setIgnoreIdentifiers(true);
        config.setIgnoreLiterals(true);
        config.setFailOnError(false);
        config.setRendererName("xml");
        config.setOnlyRecognizeLanguage(LanguageRegistry.CPD.getLanguageById("java"));
        AtomicBoolean reported = new AtomicBoolean();
        try (CpdAnalysis cpd = CpdAnalysis.create(config)) {
            for (String directory : args) {
                addSources(cpd, Path.of(directory));
            }
            cpd.performAnalysis(report -> reported.set(true));
        }
        if (!reported.get()) {
            System.exit(1);
        }
    }

    private static void addSources(CpdAnalysis cpd, Path directory) throws IOException {
        List<Path> files;
        try (Stream<Path> walk = Files.walk(directory)) {
            files = walk.filter(file -> Files.isRegularFile(file) && file.toString().endsWith(".java"))
                .sorted()
                .toList();
        }
        for (Path file : files) {
            String text = new String(Files.readAllBytes(file), StandardCharsets.UTF_8);
            String safe = CLASS_LITERAL.matcher(text).replaceAll(".$1c\\$ass");
            cpd.files().addSourceFile(FileId.fromPath(file), safe);
        }
    }
}
