package nitpicker.kotlinpsi.design;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jetbrains.kotlin.psi.KtClassOrObject;

final class Owner {
  final String id;
  final String name;
  final String qname;
  final Source source;
  final KtClassOrObject psi;
  final Owner outer;
  final Map<String, Owner> nested = new LinkedHashMap<>();
  final List<Fun> funs = new ArrayList<>();
  final List<Fun> constructors = new ArrayList<>();
  final Map<String, Prop> props = new LinkedHashMap<>();
  Owner companion;
  List<String> cases = List.of();
  Owner caseOf;
  boolean listed = true;
  boolean exported = true;

  Owner(String id, String name, String qname, Source source, KtClassOrObject psi, Owner outer) {
    this.id = id;
    this.name = name;
    this.qname = qname;
    this.source = source;
    this.psi = psi;
    this.outer = outer;
  }

  boolean module() {
    return psi == null;
  }

  String fqn() {
    return source.pkg.isEmpty() ? qname : source.pkg + "." + qname;
  }
}
