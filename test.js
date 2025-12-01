const http = require('http');
const server = http.createServer((req,res)=>{res.end('ok');});
server.listen(4000, ()=> console.log('listening 4000'));
