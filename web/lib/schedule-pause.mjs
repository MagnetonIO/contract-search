import calendar from './schedule-pauses.json' with {type:'json'};

const iso=date=>date.toISOString().slice(0,10);
const weekday=date=>(date.getUTCDay()+6)%7+1;
const shift=(date,days)=>new Date(date.getTime()+days*86400000);
const years=new Map();
export function federalHolidays(year) {
 if(!years.has(year)){
  const holidays=calendar.rules.filter(rule=>!rule.start_year||year>=rule.start_year).map(rule=>{
   let date;
   if(rule.day)date=new Date(Date.UTC(year,rule.month-1,rule.day));
   else if(rule.occurrence===-1){const last=new Date(Date.UTC(year,rule.month,0));date=shift(last,-((weekday(last)-rule.iso_weekday+7)%7));}
   else {const first=new Date(Date.UTC(year,rule.month-1,1));date=shift(first,(rule.iso_weekday-weekday(first)+7)%7+7*(rule.occurrence-1));}
   const observed=shift(date,date.getUTCDay()===6?-1:date.getUTCDay()===0?1:0);
   return Object.freeze({name:rule.name,date:iso(date),observed:iso(observed)});
  });
  years.set(year,Object.freeze(holidays));
 }
 return years.get(year);
}

// Never change enabled/source settings. Both actual and observed holidays pause
// work; adjacent years handle New Year's Day observed on December 31.
export function schedulePause(now=new Date()) {
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:calendar.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
 const day=`${parts.year}-${parts.month}-${parts.day}`,year=Number(parts.year);
 const holiday=[year-1,year,year+1].flatMap(federalHolidays).find(h=>h.date===day||h.observed===day);
 const reason=calendar.dates[day]||holiday?.name;
 return reason?{status:'scheduled_pause',day,reason}:null;
}
