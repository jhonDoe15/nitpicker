package jakarta.servlet.http;
public class Cookie implements Cloneable {
    public Cookie(String n, String v) { }
    public void setSecure(boolean b) { }
    public void setHttpOnly(boolean b) { }
    public void setMaxAge(int a) { }
    public void setPath(String p) { }
    public void setDomain(String p) { }
    public void setValue(String p) { }
    public String getValue() { return ""; }
    public String getName() { return ""; }
    public int getMaxAge() { return 0; }
}
