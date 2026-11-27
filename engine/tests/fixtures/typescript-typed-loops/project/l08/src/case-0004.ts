let ready = false; while (!ready) { ready = (await api.poll(job)).ready; await sleep(100); }
export {};
