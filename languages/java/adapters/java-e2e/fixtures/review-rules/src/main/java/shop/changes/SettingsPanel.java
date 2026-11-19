package shop.changes;

import java.util.Objects;

public final class SettingsPanel {
  private SettingsPanel() {}

  public static boolean apply(Settings current, String saved, String text) {
    boolean hasChanged = saved.equals(text); // violation: ChangeNamedEquality
    boolean statusChanged = Objects.equals(saved, text); // violation: ChangeNamedEquality
    boolean dirty = saved == text; // violation: ChangeNamedEquality
    var modifiedNow = saved.equals(text);
    boolean changedFlagDefault = saved == text;
    boolean updatedEnough = saved.equals(text);
    boolean unchanged = saved.equals(text);
    boolean same = saved.equals(text);
    boolean changed = !saved.equals(text);
    boolean modified = !Objects.equals(saved, text);
    boolean differs = saved != text;
    boolean notChanged = saved.equals(text);
    boolean isModified = current.isModified();
    boolean touched = saved.equals(text);
    boolean isUpdated = Settings.Mode.UPDATED == current.mode();
    boolean isDirty = current.mode() == Settings.Mode.DIRTY;
    return hasChanged || statusChanged || dirty || unchanged || same || changed || modified || differs
        || notChanged || isModified || touched || isUpdated || isDirty || modifiedNow || changedFlagDefault || updatedEnough;
  }

  public static boolean viaVar(String saved, String text) {
    var dirty = saved.equals(text); // violation: ChangeNamedEquality
    return dirty;
  }

  public static boolean assigned(String saved, String text) {
    boolean changed;
    changed = saved.equals(text); // violation: ChangeNamedEquality
    return changed;
  }
}
