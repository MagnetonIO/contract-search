import calendar from './schedule-pauses.json' with {type:'json'};

// Exact local dates expire without changing the user's enabled/source settings.
export function schedulePause(now=new Date()) {
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:calendar.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
 const day=`${parts.year}-${parts.month}-${parts.day}`,reason=calendar.dates[day];
 return reason?{status:'scheduled_pause',day,reason}:null;
}
