package shop.nullable;

import java.util.List;
import java.util.Optional;
import java.util.OptionalInt;

public final class FormInheritance {
  public record Form(String name, String parent) {}

  private final List<Form> forms;

  public FormInheritance(List<Form> forms) {
    this.forms = forms;
  }

  public Form parentOf(Form form) {
    Optional<Form> parent = forms.stream().filter(c -> c.name().equals(form.parent())).findFirst();
    return parent.orElseGet(null); // violation: OptionalOrElseGetNull
  }

  public int depthOf(OptionalInt depth) {
    return depth.orElseGet(null); // violation: OptionalOrElseGetNull
  }

  public Form parentOrNull(Form form) {
    Optional<Form> parent = forms.stream().filter(candidate -> candidate.name().equals(form.parent())).findFirst();
    return parent.orElse(null);
  }

  public Form parentOrRoot(Form form) {
    return forms.stream().filter(candidate -> candidate.name().equals(form.parent())).findFirst()
        .orElseGet(() -> new Form("root", ""));
  }

  public Form parentOrFail(Form form) {
    return forms.stream().filter(candidate -> candidate.name().equals(form.parent())).findFirst()
        .orElseThrow(() -> new IllegalArgumentException("no parent for " + form.name()));
  }
}
