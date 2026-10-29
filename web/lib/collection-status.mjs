export const WORKFLOW_URL='https://github.com/MagnetonIO/contract-search/actions/workflows/contracts.yml';
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'});
function slot(date){
 const parts=new Intl.DateTimeFormat('en',{timeZone:'America/Chicago',timeZoneName:'longOffset'}).formatToParts(date);
 const offset=parts.find(p=>p.type==='timeZoneName').value.match(/GMT([+-])(\d{2}):(\d{2})/);
 return Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate(),8,7)-(offset? (offset[1]==='-'?-1:1)*(Number(offset[2])*60+Number(offset[3]))*60000:0);
}
export function collectionHealth(snapshot,run,now=new Date()){
 const p=Object.fromEntries(formatter.formatToParts(now).map(p=>[p.type,p.value]));
 const day=new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),12));
 const slots=[];for(let i=-7;i<=8;i++){const d=new Date(day.getTime()+i*86400000);if(d.getUTCDay()>0&&d.getUTCDay()<6)slots.push(slot(d));}
 const expected=slots.filter(t=>t<=now.getTime()).at(-1);const next=slots.find(t=>t>now.getTime());
 const active=run?.status==='running'&&now.getTime()-Date.parse(run.started_at)<55*60000;
 const overdue=expected && Date.parse(snapshot.collected_at)<expected && now.getTime()>expected+60*60000;
 const status=active?'running':run?.status==='running'?'stalled':overdue?'overdue':run?.status==='failed'?'failed':run?.status==='completed_with_warnings'?'partial':'idle';
 return {status,next_at:new Date(next).toISOString(),expected_at:new Date(expected).toISOString(),
 title:({running:'Collection running',stalled:'Collection has not reported completion',overdue:'Scheduled collection overdue',failed:'Last collection attempt failed',partial:'Collection published with source warnings',idle:'Waiting for next scheduled collection'})[status],
 detail:status==='partial'?'Fresh results were published. Some sources failed; see their individual coverage below.':active?'Source counts below will update when this run publishes.':overdue?'The scheduled time passed without a newer scan. Saved source results below are from the last published scan.':'Source results below retain their own collection times.'};
}
