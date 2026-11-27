import vm from 'vm';
const code = 'x';
try {} catch ({ code, a = vm.runInNewContext(code) }) {}
