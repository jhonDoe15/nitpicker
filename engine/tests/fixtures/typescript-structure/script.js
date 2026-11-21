'use strict';
var legacy = function () {
  return 010 + arguments.length;
};
function Widget() {
  if (!(this instanceof Widget)) return new Widget();
  this.render = function () {
    return <div onClick={() => legacy()} />;
  };
}
Widget.prototype.update = function update(a, b, c) {
  with (a) {
    b = c;
  }
  return a, b, (function () {}), () => {};
};
exports.Widget = Widget;
export {};
