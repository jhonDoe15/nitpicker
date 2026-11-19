package shop.wrappers;

import java.util.function.Supplier;

public final class ProfileCopies {
  private ProfileCopies() {}

  public interface Setup {
    Profile configure(String tableName, String timeColumn, String mark);
  }

  public static final class Marked implements Setup {
    @Override
    public Profile configure(String tableName, String timeColumn, String mark) {
      Profile profile = new Profile();
      profile.tableName(timeColumn);
      profile.timeColumn(mark);
      return profile;
    }
  }

  @SuppressWarnings("unused")
  public static Profile mark(String tableName, String timeColumn, String mark) {
    Profile profile = new Profile();
    profile.tableName(timeColumn); // violation: SiblingValuePassed
    profile.timeColumn(mark);
    return profile.describe().isEmpty() ? null : profile;
  }

  public static Profile configureAll(String tableName, String timeColumn) {
    return new Profile().tableName(tableName).timeColumn(timeColumn);
  }

  public static Profile fromScratch(String name, String column) {
    Profile profile = new Profile();
    profile.tableName(name);
    profile.timeColumn(column);
    return profile;
  }

  public static void copy(Profile source, Profile target) {
    target.setDatabaseName(source.getDatabaseName());
    target.setTitle(source.getTitle());
    target.setVersion(source.getTitle());
  }

  public static void copyRenamed(Profile source, Profile target) {
    target.setDatabaseName(source.getVersion());
    target.setTitle(source.getTitle());
  }

  public static void copyAll(Profile source, Profile target) {
    target.setDatabaseName(source.getDatabaseName());
    target.setTitle(source.getTitle());
    target.setVersion(source.getVersion());
  }

  public static String firstOf(Supplier<String> first, Supplier<String> second, Supplier<String> third) {
    return pick(first.get(), second.get(), second.get());
  }

  public static String pick(String first, String second, String third) {
    return first + second + third;
  }

  public static String pickAll(String type1, String type2, String type3) {
    return pick(type1, type2, type2); // violation: SiblingValuePassed
  }

  public static String pickEvery(String type1, String type2, String type3) {
    return pick(type1, type2, type3) + pick(type3, type3, type1);
  }
}
