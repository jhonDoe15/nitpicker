package modernize

type Window struct {
	Start int
}

type Report struct {
	Window Window `json:",omitempty"` // want omitzero
}

type Summary struct {
	Window Window `json:",omitzero"`
}
