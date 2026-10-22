const helpers = {
  double(value) {
    return value * 2;
  },
  triple: (value) => (value > 0 ? value * 3 : 0),
};

module.exports = helpers;

exports.label = function (name) {
  return name || 'anonymous';
};

module.exports.pick = (flag) => {
  if (flag) {
    return 1;
  }
  return 2;
};

module.exports.unused = function (a, b) {
  return a && b;
};
