package shop.changes;

import java.util.List;
import java.util.Objects;

public class Settings {
  public enum Mode {
    UPDATED,
    DIRTY
  }

  private final String saved;
  private String edited;
  private final List<String> initialFiles;
  private List<String> files;
  private boolean dirty;

  public Settings(String saved, List<String> files) {
    this.saved = saved;
    this.edited = saved;
    this.initialFiles = files;
    this.files = files;
  }

  public Mode mode() {
    return Mode.UPDATED;
  }

  public void edit(String text) {
    this.edited = text;
  }

  public boolean isModified() { // violation: ChangeNamedEquality
    return saved.equals(edited);
  }

  public boolean hasChanged() { // violation: ChangeNamedEquality
    return Objects.equals(initialFiles, files);
  }

  public boolean isDirty() { // violation: ChangeNamedEquality
    return files == initialFiles;
  }

  public boolean wasUpdated(Settings other) { // violation: ChangeNamedEquality
    return files.equals(other.files);
  }

  public boolean isConfigModified() { // violation: ChangeNamedEquality
    return saved.equals(edited);
  }

  public boolean isSettingsDirty() { // violation: ChangeNamedEquality
    return Objects.equals(saved, edited);
  }

  public boolean hasPendingChanges() { // violation: ChangeNamedEquality
    return initialFiles.equals(files);
  }

  public boolean hasPendingEdits() {
    return saved.equals(edited);
  }

  public void refresh() {
    this.dirty = saved.equals(edited); // violation: ChangeNamedEquality
  }

  public boolean isDirtyState() {
    return dirty;
  }

  public boolean isChanged() {
    return !saved.equals(edited);
  }

  public boolean hasDiff() {
    return !Objects.equals(initialFiles, files);
  }

  public boolean isUnchanged() {
    return saved.equals(edited);
  }

  public boolean isEqual() {
    return saved.equals(edited);
  }

  public boolean isNotModified() {
    return saved.equals(edited);
  }

  public boolean isDifferent() {
    return saved != edited;
  }

  public boolean isModifiedSince(String other) {
    return saved.equals(other);
  }

  public boolean needsUpdate() {
    return saved.equals(edited);
  }

  public boolean isModifiedBy(Settings other) {
    if (other == null) {
      return false;
    }
    return !saved.equals(other.saved);
  }
}
