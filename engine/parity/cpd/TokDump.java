package net.sourceforge.pmd.cpd;

import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import net.sourceforge.pmd.lang.Language;
import net.sourceforge.pmd.lang.LanguagePropertyBundle;
import net.sourceforge.pmd.lang.LanguageRegistry;
import net.sourceforge.pmd.lang.document.FileId;
import net.sourceforge.pmd.lang.document.TextDocument;

public final class TokDump {
    public static void main(String[] args) throws Exception {
        Language java = LanguageRegistry.CPD.getLanguageById("java");
        LanguagePropertyBundle props = java.newPropertyBundle();
        props.setProperty(CpdLanguageProperties.CPD_ANONYMIZE_LITERALS, true);
        props.setProperty(CpdLanguageProperties.CPD_ANONYMIZE_IDENTIFIERS, true);
        CpdLexer lexer = ((CpdCapableLanguage) java).createCpdLexer(props);
        PrintWriter out = new PrintWriter(Files.newBufferedWriter(Path.of(args[0]), StandardCharsets.UTF_8));
        for (String name : Files.readAllLines(Path.of(args[1]))) {
            Path file = Path.of(name);
            String text = new String(Files.readAllBytes(file), StandardCharsets.UTF_8);
            String safe = (String) CpdReportAccess.lexable(file, text);
            Tokens tokens = new Tokens();
            out.println("FILE\t" + name);
            try {
                TextDocument doc = TextDocument.readOnlyString(safe, FileId.fromPath(file), java.getDefaultVersion());
                try (TokenFactory factory = Tokens.factoryForFile(doc, tokens)) {
                    lexer.tokenize(doc, factory);
                }
                for (TokenEntry t : tokens.getTokens()) {
                    out.println(t.getImage(tokens) + "\t" + t.getBeginLine() + "\t" + t.getBeginColumn() + "\t" + t.getEndLine() + "\t" + t.getEndColumn());
                }
            } catch (Exception e) {
                out.println("ERROR\t" + e.getClass().getSimpleName() + "\t" + String.valueOf(e.getMessage()).replace('\n', ' '));
            }
        }
        out.close();
    }
}
