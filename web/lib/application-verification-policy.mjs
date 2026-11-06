export const VERIFICATION_SECONDS=900;
export function greenhouseUrl(raw){try{const u=new URL(raw);return u.protocol==='https:'&&(u.hostname==='grnh.se'||u.hostname.endsWith('.greenhouse.io')||u.hostname==='greenhouse.io');}catch{return false;}}
export function verificationTarget(raw,target){try{const a=new URL(raw),b=new URL(target);return greenhouseUrl(raw)&&a.origin===b.origin&&a.pathname.replace(/\/$/,'')===b.pathname.replace(/\/$/,'')&&/\/jobs\/\d+/.test(a.pathname);}catch{return false;}}
export function emailVerification(text,url){
 if(!greenhouseUrl(url))return null;
 const match=String(text||'').match(/A verification code was sent to\s+([^\s@]+@[^\s]+?\.[A-Za-z]+)\.\s*To submit your application, enter the (\d+)-character code to confirm you(?:'|’)re a human\./i);
 return match?{email:match[1],length:Number(match[2]),notice:match[0]}:null;
}
export function verificationEvidence(attempt){
 for(const e of [...(attempt?.outcome_history||[])].reverse()){const found=emailVerification(e.page_excerpt||e.site_notice,e.observed_url||attempt.application_url);if(found&&verificationTarget(e.observed_url||attempt.application_url,attempt.application_url))return found;}
 return null;
}
export function verificationAction(){return {owner:'user',kind:'email_verification',title:'Enter the employer’s email code',instruction:'Open the private verification browser, enter the code from the employer email, and resubmit there. Then check confirmation. Other applications can continue.',detail:'The application is waiting for email verification. It is not a confirmed submission.',site:'Greenhouse'};}
