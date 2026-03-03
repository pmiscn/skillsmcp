try {
  const resp = await fetch('http://127.0.0.1:8001/index/rebuild', {
    method: 'POST',
    headers: { 'X-API-KEY': 'local-dev-key-123' }
  });
  console.log('Status:', resp.status);
  const text = await resp.text();
  console.log('Text:', text);
} catch (e) {
  console.error('Fetch error:', e);
}
