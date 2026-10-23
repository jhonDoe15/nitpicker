package nitpicker.designfacts.model;

import com.sun.source.tree.*;
import com.sun.source.util.SourcePositions;
import java.io.IOException;
import java.util.*;

public final class Unit {
  public final String file;
  public final CompilationUnitTree tree;
  public final SourcePositions positions;
  public final String source;
  public final String pkg;
  public final Map<String, String> single = new HashMap<>();
  public final List<String> onDemand = new ArrayList<>();
  public final List<String> staticSingle = new ArrayList<>();
  public final List<String> staticOnDemand = new ArrayList<>();
  public final boolean lombok;

  public Unit(String file, CompilationUnitTree tree, SourcePositions positions) throws IOException {
    this.file = file;
    this.tree = tree;
    this.positions = positions;
    this.source = tree.getSourceFile().getCharContent(true).toString();
    this.pkg = tree.getPackageName() == null ? "" : tree.getPackageName().toString();
    boolean lombokImport = false;
    for (ImportTree item : tree.getImports()) {
      String name = item.getQualifiedIdentifier().toString();
      lombokImport |= name.startsWith("lombok.");
      boolean wildcard = name.endsWith(".*");
      String base = wildcard ? name.substring(0, name.length() - 2) : name;
      if (item.isStatic()) {
        (wildcard ? staticOnDemand : staticSingle).add(base);
      } else if (wildcard) {
        onDemand.add(base);
      } else {
        single.put(base.substring(base.lastIndexOf('.') + 1), base);
      }
    }
    this.lombok = lombokImport;
  }

  public int line(Tree node) {
    return lineAt(positions.getStartPosition(tree, node));
  }

  public int lineAt(long position) {
    return (int) tree.getLineMap().getLineNumber(Math.max(position, 0));
  }

  public long start(Tree node) {
    return positions.getStartPosition(tree, node);
  }

  public long end(Tree node) {
    return positions.getEndPosition(tree, node);
  }

  public String text(Tree node) {
    long from = start(node);
    long to = end(node);
    return from < 0 || to < from || to > source.length() ? "" : source.substring((int) from, (int) to);
  }
}
