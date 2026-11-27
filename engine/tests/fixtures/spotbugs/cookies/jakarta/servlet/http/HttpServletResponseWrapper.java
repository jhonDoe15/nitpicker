package jakarta.servlet.http;
public class HttpServletResponseWrapper implements HttpServletResponse {
    public void addCookie(Cookie c) { }
    public String encodeURL(String u) { return u; }
    public String encodeRedirectURL(String u) { return u; }
    public String encodeUrl(String u) { return u; }
    public String encodeRedirectUrl(String u) { return u; }
    public void addHeader(String n, String v) { }
    public void setHeader(String n, String v) { }
}
