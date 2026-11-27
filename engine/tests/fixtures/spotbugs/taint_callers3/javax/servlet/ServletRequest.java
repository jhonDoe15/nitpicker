package javax.servlet;

public interface ServletRequest {
    String getParameter(String name);
    String[] getParameterValues(String name);
    java.util.Map<String, String[]> getParameterMap();
    java.io.BufferedReader getReader() throws java.io.IOException;
    Object getAttribute(String name);
}
