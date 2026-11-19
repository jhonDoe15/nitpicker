package shop.nullable;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

final class DownloadDirs {
  private static final Logger LOG = LoggerFactory.getLogger(UploadDirs.class); // violation: LoggerForOtherClass

  void log(String message) {
    LOG.info(message);
  }
}

final class ResponseInfoReader {
  private static final Logger LOG = LoggerFactory.getLogger(ResponseInfoWriter.class); // violation: LoggerForOtherClass

  void log(String message) {
    LOG.info(message);
  }
}

final class RequestInfoNotifier {
  private static final Logger LOG = LoggerFactory.getLogger(TemplateLocator.class);

  void log(String message) {
    LOG.info(message);
  }
}
