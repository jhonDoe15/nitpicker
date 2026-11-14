package design

type fakeRepository struct{}

func (fakeRepository) Find(id string) (string, error) {
	return id, nil
}

var _ Repository = fakeRepository{}
