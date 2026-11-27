const sent = []; ids.forEach((id) => sent.push(api.send(id))); await Promise.allSettled(sent);
export {};
