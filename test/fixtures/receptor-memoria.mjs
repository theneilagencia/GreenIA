import { criarReceptor } from '../../src/receptor-backup.js';
const r=criarReceptor({pasta:process.env.QA_PASTA,chave:'memoria-teste',segredo:'segredo-sintetico-memoria',log:()=>{}});
await new Promise(ok=>r.servidor.listen(0,'127.0.0.1',ok));
process.send({porta:r.servidor.address().port});
process.on('message',m=>{if(m==='stats')process.send({rssMaxKiB:process.resourceUsage().maxRSS});});
process.on('disconnect',()=>{r.servidor.close();r.servidor.closeAllConnections();});
