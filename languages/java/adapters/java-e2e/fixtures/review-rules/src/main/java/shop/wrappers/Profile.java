package shop.wrappers;

public class Profile {
  private String tableName = "";
  private String timeColumn = "";
  private String databaseName = "";
  private String version = "";
  private String title = "";

  public Profile tableName(String value) {
    this.tableName = value;
    return this;
  }

  public Profile timeColumn(String value) {
    this.timeColumn = value;
    return this;
  }

  public void setDatabaseName(String value) {
    this.databaseName = value;
  }

  public void setVersion(String value) {
    this.version = value;
  }

  public void setTitle(String value) {
    this.title = value;
  }

  public String getDatabaseName() {
    return databaseName;
  }

  public String getVersion() {
    return version;
  }

  public String getTitle() {
    return title;
  }

  public String describe() {
    return tableName + timeColumn + databaseName + version + title;
  }
}
