package com.google.gwt.dom.client;

public class Style {
    public enum Unit {
        PX,
        EM
    }

    public void setProperty(String name, String value) {}

    public void setProperty(String name, double value, Unit unit) {}

    public void setPropertyPx(String name, int value) {}

    public void setWidth(double value, Unit unit) {}
}
