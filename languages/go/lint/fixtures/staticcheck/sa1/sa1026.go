package sa1

import "encoding/json"

type Job struct {
	Name string
	Run  func()
}

func MarshalFunc(job Job) ([]byte, error) {
	return json.Marshal(job) // want SA1026
}

type JobData struct {
	Name string
}

func MarshalData(job JobData) ([]byte, error) {
	return json.Marshal(job)
}
