// Local read-only preview. Does not serve Git, exports, or personal files.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const production=process.argv.includes('--production');
const root=path.resolve(production?'.site-build':'.');
const port=production?4329:4328;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
  let name;
  try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html';}catch{res.writeHead(400);return res.end();}
  const ext=path.extname(name);
  if(name.includes('/')||name.includes('\\')||name.startsWith('.')||!types[ext]||name==='firebase.json'){res.writeHead(404);return res.end();}
  const target=path.join(root,name);
  if(!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404);return res.end();}
  res.writeHead(200,{'Content-Type':types[ext]+'; charset=utf-8','Cache-Control':'no-cache'});
  fs.createReadStream(target).pipe(res);
}).listen(port,'127.0.0.1',()=>console.log(`${production?'Production':'Development'} preview: http://127.0.0.1:${port}/competition-stats.html`));
