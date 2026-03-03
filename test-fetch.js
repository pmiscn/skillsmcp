try {
  const resp = await fetch('http://127.0.0.1:8001/index');
  console.log('Status:', resp.status);
  const json = await resp.json();
  console.log('JSON:', json);
} catch (e) {
  console.error('Fetch error:', e);
}
