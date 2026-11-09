package stylecheck

type Account struct {
	Balance int
}

func (self *Account) Deposit(amount int) { // want ST1006
	self.Balance += amount
}

type Ledger struct {
	Entries []int
}

func (ledger *Ledger) Record(amount int) {
	ledger.Entries = append(ledger.Entries, amount)
}
