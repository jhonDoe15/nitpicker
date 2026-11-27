const { execFileSync } = require('child_process');
test('inits', () => { execFileSync('git', ['init']); });
test('inits again', () => { execFileSync('git', ['status']); });