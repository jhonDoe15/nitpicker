const ACCOUNT = `package ledger

type Account struct {
	Status string
	Tier   int
	Name   string
}

func (a *Account) Label() string {
	return a.Name
}
`;

function consumer(pkg, name, condition) {
  return `package ${pkg}

import "shop/internal/ledger"

func ${name}(a *ledger.Account) int {
	if ${condition} {
		return 1
	}
	return 0
}
`;
}

export const FOREIGN_DECISION_FILES = {
  'internal/ledger/account.go': ACCOUNT,
  'internal/limits/limit.go': consumer('limits', 'Limit', 'a.Status == "open" && a.Tier > 2'),
  'internal/quota/quota.go': consumer('quota', 'Quota', 'a.Tier > 5 || a.Status == "held"'),
};

export const SINGLE_FIELD_FILES = {
  'internal/ledger/account.go': ACCOUNT,
  'internal/limits/limit.go': consumer('limits', 'Limit', 'a.Status == "open"'),
  'internal/quota/quota.go': consumer('quota', 'Quota', 'a.Status == "held"'),
};
