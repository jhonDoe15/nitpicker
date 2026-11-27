package javax.servlet.http;
public interface HttpServletResponse {
    void addCookie(Cookie c);
    String encodeURL(String u);
    String encodeRedirectURL(String u);
    String encodeUrl(String u);
    String encodeRedirectUrl(String u);
    void addHeader(String n, String v);
    void setHeader(String n, String v);
}
