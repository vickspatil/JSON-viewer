import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('./', import.meta.url);
const files = { '/': ['index.html','text/html'], '/index.html': ['index.html','text/html'], '/app.js': ['app.js','text/javascript'], '/worker.js': ['worker.js','text/javascript'], '/style.css': ['style.css','text/css'] };
const port = Number(process.env.PORT || 3000);
http.createServer(async (req,res) => {
  const file = files[new URL(req.url,'http://localhost').pathname];
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try { const data=await readFile(new URL(file[0],root)); res.writeHead(200,{'Content-Type':`${file[1]}; charset=utf-8`,'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; worker-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"}); res.end(data); }
  catch { res.writeHead(500); res.end('Unable to read app file'); }
}).listen(port,'127.0.0.1',()=>console.log(`JSON Studio is running at http://localhost:${port}`));
