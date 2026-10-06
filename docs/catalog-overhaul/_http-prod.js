const fs = require('fs');
const https = require('https');

function get(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'User-Agent': 'builtiq-env-check' } }, (res) => {
      const headers = {};
      Object.keys(res.headers).forEach((k) => {
        if (/vercel|x-next|cache|etag|age|date/i.test(k)) headers[k] = res.headers[k];
      });
      let body = '';
      res.on('data', (c) => { if (body.length < 8000) body += c; });
      res.on('end', () => resolve({ url, status: res.statusCode, headers, bodySnippet: body.slice(0, 500) }));
    });
    req.on('error', (e) => resolve({ url, error: e.message }));
    req.setTimeout(12000, () => { req.destroy(); resolve({ url, error: 'timeout' }); });
  });
}

(async () => {
  const urls = [
    'https://builtiq-duf7.vercel.app/',
    'https://builtiq-duf7.vercel.app/_next/static/BUILD_ID',
  ];
  const out = [];
  for (const url of urls) out.push(await get(url));
  fs.writeFileSync('docs/catalog-overhaul/_http-prod.json', JSON.stringify(out, null, 2));
})();
