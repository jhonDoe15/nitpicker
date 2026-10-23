package nitpicker.kotlinpsi.design.model;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jetbrains.kotlin.psi.KtClassOrObject;

public final class Owner {
  public final String id;
  public final String name;
  public final String qname;
  public final Source source;
  public final KtClassOrObject psi;
  public final Owner outer;
  public final Map<String, Owner> nested = new LinkedHashMap<>();
  public final List<Fun> funs = new ArrayList<>();
  public final List<Fun> constructors = new ArrayList<>();
  public final Map<String, Prop> props = new LinkedHashMap<>();
  public Owner companion;
  public List<String> cases = List.of();
  public Owner caseOf;
  public boolean listed = true;
  public boolean exported = true;

  public Owner(String id, String name, String qname, Source source, KtClassOrObject psi, Owner outer) {
    this.id = id;
    this.name = name;
    this.qname = qname;
    this.source = source;
    this.psi = psi;
    this.outer = outer;
  }

  public boolean module() {
    return psi == null;
  }

  public String fqn() {
    return source.pkg.isEmpty() ? qname : source.pkg + "." + qname;
  }
}
