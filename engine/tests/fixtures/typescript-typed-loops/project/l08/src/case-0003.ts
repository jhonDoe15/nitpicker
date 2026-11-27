for (let attempt = 0; attempt < 5; attempt++) { const response = await fetch(url); if (response.ok) { return response; } await delay(2 ** attempt * 100); }
export {};
