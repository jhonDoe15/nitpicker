package nitpicker.kotlinpsi.design;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;

final class Index {
  final List<Source> sources;
  final List<Owner> owners = new ArrayList<>();
  final Map<PsiElement, Owner> byPsi = new IdentityHashMap<>();
  private final Map<String, Owner> types = new HashMap<>();
  private final Set<String> duplicated = new HashSet<>();
  private final Map<String, List<Fun>> topFuns = new HashMap<>();
  private final Map<String, List<Prop>> topProps = new HashMap<>();
  private final Map<Source, Owner> modules = new IdentityHashMap<>();

  Index(List<Source> sources) {
    this.sources = sources;
    new Declarer(this).run();
    Ids.assign(owners);
  }

  Owner type(String fqn) {
    return duplicated.contains(fqn) ? null : types.get(fqn);
  }

  void register(Owner owner) {
    owners.add(owner);
    if (!owner.module()) {
      byPsi.put(owner.psi, owner);
      if (types.put(owner.fqn(), owner) != null) {
        duplicated.add(owner.fqn());
      }
    }
  }

  Owner module(Source source) {
    return modules.computeIfAbsent(source, key -> {
      Owner module = new Owner(key.path, key.stem, key.stem, key, null, null);
      register(module);
      return module;
    });
  }

  void addTop(Source source, Fun function) {
    topFuns.computeIfAbsent(key(source.pkg, function.name), k -> new ArrayList<>()).add(function);
  }

  void addTop(Source source, Prop prop) {
    topProps.computeIfAbsent(key(source.pkg, prop.name), k -> new ArrayList<>()).add(prop);
  }

  List<Fun> topFuns(String pkg, String name) {
    return topFuns.getOrDefault(key(pkg, name), List.of());
  }

  List<Prop> topProps(String pkg, String name) {
    return topProps.getOrDefault(key(pkg, name), List.of());
  }

  private static String key(String pkg, String name) {
    return pkg + "\0" + name;
  }
}
