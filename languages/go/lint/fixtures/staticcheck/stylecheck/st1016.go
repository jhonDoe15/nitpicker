package stylecheck

type Wallet struct {
	Coins int
}

func (wallet *Wallet) Add(coins int) { // want ST1016
	wallet.Coins += coins
}

func (purse *Wallet) Remove(coins int) {
	purse.Coins -= coins
}
