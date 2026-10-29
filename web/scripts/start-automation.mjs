// Operator helper: starts the deployed workflow using the existing Vercel CLI login.
// The workflow itself still enforces saved profile, enablement, hours, limits and exclusions.
import {readFile} from 'node:fs/promises';import {homedir} from 'node:os';import path from 'node:path';
import {start,getRun} from 'workflow/api';import {setWorld} from 'workflow/runtime';import {createWorld} from '@workflow/world-vercel';
const deployment=process.argv[2];if(!/^(?:dpl|wrun)_[A-Za-z0-9]+$/.test(deployment||''))throw Error('Usage: node web/scripts/start-automation.mjs <deployment-id>');
let token=process.env.WORKFLOW_VERCEL_AUTH_TOKEN;
if(!token){for(const location of ['Library/Application Support/com.vercel.cli/auth.json','.local/share/com.vercel.cli/auth.json','.vercel/auth.json','AppData/Roaming/com.vercel.cli/auth.json']){try{token=JSON.parse(await readFile(path.join(homedir(),location),'utf8')).token;if(token)break;}catch{}}}
if(!token)throw Error('Sign into the Vercel CLI first. No token should be pasted into this script.');
if(deployment.startsWith('dpl_'))process.env.VERCEL_DEPLOYMENT_ID=deployment;
setWorld(createWorld({token,projectConfig:{projectId:'prj_vqOshmC6BaVQoSsI5G87NLdAOrcK',teamId:'team_N0SIOgAKLlD4Sa91HEiKpDPo',environment:'production'}}));
const run=deployment.startsWith('wrun_')?getRun(deployment):await start({workflowId:'workflow//./workflows/applications//applicationCycle'},process.argv.includes('--manual')?[{manual:true}]:[],{deploymentId:deployment});
if(process.argv.includes('--wait')){await run.returnValue;}
console.log(JSON.stringify({run_id:run.runId,status:await run.status}));
