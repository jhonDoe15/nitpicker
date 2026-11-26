package com.google.common.html.types;

class S12InsideSafeHtml {
  SafeHtmlProto buildProto() {
    return SafeHtmlProto.newBuilder().setPrivateDoNotAccessOrElseSafeHtmlWrappedValue("foo").build();
  }

  String read(SafeHtmlProto proto) {
    return proto.getPrivateDoNotAccessOrElseSafeHtmlWrappedValue();
  }
}
