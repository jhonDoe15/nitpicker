package shop.values;

import java.util.List;
import org.springframework.util.ClassUtils;

public class Visualizations {
  public static class Chart {
    String title() {
      return "chart";
    }
  }

  public static class BarChart extends Chart {
    String axis() {
      return "x";
    }
  }

  String titleOf(Class<?> type, Object value) {
    if (!type.isAssignableFrom(Chart.class)) { // violation: ReversedAssignableCheck
      return "";
    }
    Chart chart = (Chart) value;
    return chart.title();
  }

  String axisOf(Class<?> type, Object value) {
    if (type.isAssignableFrom(BarChart.class)) { // violation: ReversedAssignableCheck
      return ((BarChart) value).axis();
    }
    return "";
  }

  String titleOrNone(Object value) {
    Class<?> type = value.getClass();
    Chart chart = type.isAssignableFrom(Chart.class) ? (Chart) value : null; // violation: ReversedAssignableCheck
    return chart == null ? "" : chart.title();
  }

  String springAxis(Class<?> type, Object value) {
    if (ClassUtils.isAssignable(type, BarChart.class)) { // violation: ReversedAssignableCheck
      return ((BarChart) value).axis();
    }
    return "";
  }

  boolean injectable(Class<?> parameterType) {
    return parameterType.isAssignableFrom(Chart.class);
  }

  String correctDirection(Class<?> type, Object value) {
    if (!Chart.class.isAssignableFrom(type)) {
      return "";
    }
    return ((Chart) value).title();
  }

  String instanceTest(Object value) {
    if (value instanceof BarChart chart) {
      return chart.axis();
    }
    return Chart.class.isInstance(value) ? ((Chart) value).title() : "";
  }

  String springCorrect(Class<?> type, Object value) {
    if (ClassUtils.isAssignable(BarChart.class, type)) {
      return ((BarChart) value).axis();
    }
    return "";
  }

  String otherCast(Class<?> type, List<Object> values) {
    if (type.isAssignableFrom(Chart.class)) {
      return String.valueOf(values.size());
    }
    return ((BarChart) values.get(0)).axis();
  }

  Chart newChart(Class<?> paramType, Object value) {
    if (paramType.isAssignableFrom(Chart.class)) {
      return new Chart();
    }
    if (value != null) {
      return (Chart) value;
    }
    return null;
  }

  String unrelatedCast(Class<?> type, List<Object> values) {
    if (!type.isAssignableFrom(Chart.class)) {
      return "";
    }
    return ((Chart) values.get(0)).title();
  }

  String wrongBranch(Class<?> type, Object value) {
    if (!type.isAssignableFrom(Chart.class)) {
      return ((Chart) value).title();
    }
    return "";
  }

  Chart conditionalBranch(Class<?> type, Object value) {
    return type.isAssignableFrom(Chart.class) ? null : (Chart) value;
  }

  String elseBranch(Class<?> type, Object value) {
    if (type.isAssignableFrom(Chart.class)) {
      return "";
    } else {
      return ((Chart) value).title();
    }
  }

  Chart factory(Class<?> type) {
    if (type.isAssignableFrom(Chart.class)) {
      Chart created = new Chart();
      return (Chart) created;
    }
    return null;
  }

  String negatedElse(Class<?> type, Object value) {
    if (!type.isAssignableFrom(Chart.class)) { // violation: ReversedAssignableCheck
      return "";
    } else {
      return ((Chart) value).title();
    }
  }
}
