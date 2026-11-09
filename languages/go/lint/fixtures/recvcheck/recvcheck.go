package recvcheck

type Account struct { // want recvcheck
	Balance int
}

func (account Account) Total() int {
	return account.Balance
}

func (account *Account) Deposit(amount int) {
	account.Balance += amount
}

type Wallet struct {
	Balance int
}

func (wallet *Wallet) Total() int {
	return wallet.Balance
}

func (wallet *Wallet) Deposit(amount int) {
	wallet.Balance += amount
}
