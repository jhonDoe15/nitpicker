SAMPLE=languages/javascript/preset/fixtures/js-clean
dev() { node -p "require('$repo/package.json').devDependencies['$1']"; }
packages="vitest@$(dev vitest) @vitest/coverage-v8@$(dev @vitest/coverage-v8)"
packages+=" typescript@$(dev typescript) @types/node@$(dev @types/node)"
SETUP="npm install --no-audit --no-fund $packages"
greet=src/main/features/greeting/domain/greet.js
clean() {
  perl -pi -e 's/Hello, /Hi, /g' "$work/$greet" "$work/test/greeting.test.js" "$work/test/wiring.test.mjs"
}
violation() { printf '\nvar legacyCounter = 1;\nexport const counter = legacyCounter;\n' >>"$work/$greet"; }
VIOLATION_RULE='^eslint-lint/no-var$'
