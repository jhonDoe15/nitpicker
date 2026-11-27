for (const id of ids) { connection.send(JSON.stringify({ type: 'drain' })); }
export {};
