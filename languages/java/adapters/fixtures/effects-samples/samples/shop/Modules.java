package shop;

import java.util.List;
import lib.Remote;

class Modules {
  Remote remote;

  void eachItem(List<Long> ids) {
    for (long id : ids) {
      remote.load(id);
    }
  }
}
