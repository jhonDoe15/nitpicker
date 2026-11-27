package org.apache.commons.mail;
public abstract class Email {
    public Email setSSLOnConnect(boolean b) { return this; }
    public void setSSL(boolean b) { }
    public Email setSSLCheckServerIdentity(boolean b) { return this; }
    public Email setStartTLSEnabled(boolean b) { return this; }
    public Email setStartTLSRequired(boolean b) { return this; }
    public void setTLS(boolean b) { }
    public void setHostName(String h) { }
    public String send() { return ""; }
}
