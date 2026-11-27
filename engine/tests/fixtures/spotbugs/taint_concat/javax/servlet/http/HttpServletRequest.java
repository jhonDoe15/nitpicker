package javax.servlet.http;

public interface HttpServletRequest extends javax.servlet.ServletRequest {
    String getHeader(String name);
    Cookie[] getCookies();
    String getRequestURI();
    String getPathInfo();
    String getQueryString();
    String getServletPath();
    String getRemoteUser();
    String getContextPath();
    HttpSession getSession();
}
