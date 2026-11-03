import java.io.InputStream;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;
import java.util.Map;
import java.util.ServiceLoader;
import java.util.TreeMap;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

public final class ToolText {
  private static final String[] PMD_CATEGORIES = {
    "bestpractices", "codestyle", "design", "documentation", "errorprone", "multithreading",
    "performance", "security"
  };

  private ToolText() {}

  public static void main(String[] args) throws Exception {
    Map<String, Map<String, String>> rules =
        switch (args[0]) {
          case "pmd" -> pmdRules();
          case "errorprone" -> errorProneChecks();
          case "detekt" -> detektRules();
          case "checkstyle" -> checkstyleChecks(args[1]);
          case "spotbugs" -> spotbugsPatterns();
          default -> throw new IllegalArgumentException("Unknown tool " + args[0]);
        };
    System.out.println(json(rules));
  }

  private static Document parse(InputStream stream) throws Exception {
    DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
    factory.setNamespaceAware(false);
    factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    try (stream) {
      return factory.newDocumentBuilder().parse(stream);
    }
  }

  private static String childText(Element element, String name) {
    NodeList children = element.getElementsByTagName(name);
    return children.getLength() == 0 ? "" : children.item(0).getTextContent().strip();
  }

  private static Map<String, Map<String, String>> pmdRules() throws Exception {
    Map<String, Map<String, String>> rules = new TreeMap<>();
    ClassLoader loader = ToolText.class.getClassLoader();
    for (String category : PMD_CATEGORIES) {
      Document document =
          parse(loader.getResourceAsStream("category/java/" + category + ".xml"));
      NodeList nodes = document.getElementsByTagName("rule");
      for (int index = 0; index < nodes.getLength(); index++) {
        Element rule = (Element) nodes.item(index);
        if (rule.getAttribute("name").isEmpty()) {
          continue;
        }
        Map<String, String> fields = new TreeMap<>();
        fields.put("category", category);
        if (!rule.getAttribute("ref").isEmpty()) {
          fields.put("renamedTo", rule.getAttribute("ref"));
          rules.put(rule.getAttribute("name"), fields);
          continue;
        }
        fields.put("description", childText(rule, "description"));
        fields.put("url", rule.getAttribute("externalInfoUrl"));
        rules.put(rule.getAttribute("name"), fields);
      }
    }
    return rules;
  }

  private static Map<String, Map<String, String>> errorProneChecks() throws Exception {
    Class<?> suppliers = Class.forName("com.google.errorprone.scanner.BuiltInCheckerSuppliers");
    Object all = suppliers.getMethod("allChecks").invoke(null);
    Class<?> supplier = Class.forName("com.google.errorprone.scanner.ScannerSupplier");
    Map<?, ?> checks = (Map<?, ?>) supplier.getMethod("getAllChecks").invoke(all);
    List<Object> infos = new ArrayList<>(checks.values());
    Class<?> info = Class.forName("com.google.errorprone.BugCheckerInfo");
    infos.add(
        info.getMethod("create", Class.class).invoke(null, Class.forName("com.uber.nullaway.NullAway")));
    Map<String, Map<String, String>> rules = new TreeMap<>();
    for (Object check : infos) {
      Map<String, String> fields = new TreeMap<>();
      fields.put("summary", String.valueOf(info.getMethod("message").invoke(check)));
      fields.put("severity", String.valueOf(info.getMethod("defaultSeverity").invoke(check)));
      Object link = info.getMethod("linkUrl").invoke(check);
      fields.put("url", link == null ? "" : String.valueOf(link));
      rules.put(String.valueOf(info.getMethod("canonicalName").invoke(check)), fields);
    }
    return rules;
  }

  private static Map<String, Map<String, String>> detektRules() throws Exception {
    Class<?> provider = Class.forName("io.gitlab.arturbosch.detekt.api.RuleSetProvider");
    Class<?> config = Class.forName("io.gitlab.arturbosch.detekt.api.Config");
    Object companion = config.getField("Companion").get(null);
    Object empty = companion.getClass().getMethod("getEmpty").invoke(companion);
    Class<?> ruleSetType = Class.forName("io.gitlab.arturbosch.detekt.api.RuleSet");
    Map<String, Map<String, String>> rules = new TreeMap<>();
    for (Object ruleSetProvider : ServiceLoader.load(provider)) {
      Object ruleSet = provider.getMethod("instance", config).invoke(ruleSetProvider, empty);
      String ruleSetId = String.valueOf(ruleSetType.getMethod("getId").invoke(ruleSet));
      for (Object rule : (List<?>) ruleSetType.getMethod("getRules").invoke(ruleSet)) {
        addDetektRule(rules, ruleSetId, rule);
      }
    }
    return rules;
  }

  private static void addDetektRule(Map<String, Map<String, String>> rules, String ruleSet, Object rule)
      throws Exception {
    Class<?> multiRule = Class.forName("io.gitlab.arturbosch.detekt.api.MultiRule");
    if (multiRule.isInstance(rule)) {
      for (Object inner : (List<?>) multiRule.getMethod("getRules").invoke(rule)) {
        addDetektRule(rules, ruleSet, inner);
      }
      return;
    }
    Object issue = Class.forName("io.gitlab.arturbosch.detekt.api.Rule").getMethod("getIssue").invoke(rule);
    Class<?> issueType = Class.forName("io.gitlab.arturbosch.detekt.api.Issue");
    Map<String, String> fields = new TreeMap<>();
    fields.put("description", String.valueOf(issueType.getMethod("getDescription").invoke(issue)));
    String id = String.valueOf(issueType.getMethod("getId").invoke(issue));
    rules.put(ruleSet + "." + id, fields);
  }


  private static Map<String, Map<String, String>> checkstyleChecks(String jar) throws Exception {
    String prefix = "com/puppycrawl/tools/checkstyle/checks/";
    Map<String, Map<String, String>> rules = new TreeMap<>();
    try (JarFile file = new JarFile(jar)) {
      Enumeration<JarEntry> entries = file.entries();
      while (entries.hasMoreElements()) {
        String name = entries.nextElement().getName();
        if (!name.startsWith(prefix) || !name.endsWith("Check.class") || name.contains("$")) {
          continue;
        }
        String path = name.substring(prefix.length(), name.length() - "Check.class".length());
        int slash = path.lastIndexOf('/');
        String check = path.substring(slash + 1);
        if (check.startsWith("Abstract")) {
          continue;
        }
        Map<String, String> fields = new TreeMap<>();
        fields.put("category", slash == -1 ? "misc" : path.substring(0, slash).replace('/', '.'));
        rules.put(check, fields);
      }
    }
    return rules;
  }

  private static Map<String, Map<String, String>> spotbugsPatterns() throws Exception {
    ClassLoader loader = ToolText.class.getClassLoader();
    Document plugin = parse(loader.getResourceAsStream("findbugs.xml"));
    Document messages = parse(loader.getResourceAsStream("messages.xml"));
    Map<String, String> headings = new TreeMap<>();
    NodeList described = messages.getElementsByTagName("BugPattern");
    for (int index = 0; index < described.getLength(); index++) {
      Element pattern = (Element) described.item(index);
      headings.put(pattern.getAttribute("type"), childText(pattern, "ShortDescription"));
    }
    Map<String, Map<String, String>> rules = new TreeMap<>();
    NodeList patterns = plugin.getElementsByTagName("BugPattern");
    for (int index = 0; index < patterns.getLength(); index++) {
      Element pattern = (Element) patterns.item(index);
      String type = pattern.getAttribute("type");
      Map<String, String> fields = new TreeMap<>();
      fields.put("category", pattern.getAttribute("category"));
      fields.put(
          "anchor",
          anchor(pattern.getAttribute("abbrev") + ": " + headings.getOrDefault(type, "") + " (" + type + ")"));
      rules.put(type, fields);
    }
    return rules;
  }

  private static String anchor(String heading) {
    return heading.toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
  }

  private static String json(Map<String, Map<String, String>> rules) {
    StringBuilder out = new StringBuilder("{");
    String separator = "";
    for (Map.Entry<String, Map<String, String>> rule : rules.entrySet()) {
      out.append(separator).append(quote(rule.getKey())).append(":{");
      String fieldSeparator = "";
      for (Map.Entry<String, String> field : rule.getValue().entrySet()) {
        out.append(fieldSeparator).append(quote(field.getKey())).append(':').append(quote(field.getValue()));
        fieldSeparator = ",";
      }
      out.append('}');
      separator = ",";
    }
    return out.append('}').toString();
  }

  private static String quote(String text) {
    StringBuilder out = new StringBuilder("\"");
    for (char character : text.toCharArray()) {
      switch (character) {
        case '"' -> out.append("\\\"");
        case '\\' -> out.append("\\\\");
        case '\n' -> out.append("\\n");
        case '\r' -> out.append("\\r");
        case '\t' -> out.append("\\t");
        default -> {
          if (character < 0x20) {
            out.append(String.format("\\u%04x", (int) character));
          } else {
            out.append(character);
          }
        }
      }
    }
    return out.append('"').toString();
  }
}
