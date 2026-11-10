import {randomBytes,createCipheriv,createDecipheriv,createHash,timingSafeEqual} from 'node:crypto';
import {readJson,writeJson} from './store.ts';
import {load} from 'cheerio';

const ACCOUNT='mlong@magneton.io';
const CALLBACK='https://contract-search-alpha.vercel.app/api/gmail-callback';
export function validGmailCallback(state,cookie){return typeof state==='string'&&typeof cookie==='string'&&/^[A-Za-z0-9_-]{43}$/.test(state)&&/^[A-Za-z0-9_-]{43}$/.test(cookie)&&timingSafeEqual(Buffer.from(state),Buffer.from(cookie));}
const header=(message,name)=>(message.payload?.headers||[]).find(h=>h.name.toLowerCase()===name.toLowerCase())?.value||'';
function textParts(part){const raw=part?.body?.data?Buffer.from(part.body.data,'base64url').toString('utf8'):'';let text=part?.mimeType==='text/plain'?raw:'';if(part?.mimeType==='text/html'){const $=load(raw);$('script,style').remove();text=$('body').text();}return text+(part?.parts||[]).map(textParts).join('\n');}
export function selectVerificationCode(messages,expected){
 const found=[];
 for(const m of messages){
  if(expected.consumed?.includes(m.id)||Number(m.internalDate)<Date.parse(expected.requested_at)||Number(m.internalDate)>Date.parse(expected.requested_at)+120000)continue;
  const from=header(m,'from').match(/<([^>]+)>/)?.[1]||header(m,'from').trim();
  if(!expected.senders.includes(from.toLowerCase())||!(header(m,'to').toLowerCase().match(/[\w.+-]+@[\w.-]+\.[a-z]+/g)||[]).includes(expected.recipient.toLowerCase()))continue;
  const domain=from.toLowerCase().split('@')[1],auth=header(m,'authentication-results');
  if(!/^mx\.google\.com;/i.test(auth)||!auth.split(';').some(part=>/\bdkim=pass\b/.test(part)&&[...part.matchAll(/header\.(?:i|d)=@?([a-z0-9.-]+)/gi)].some(match=>domain===match[1].toLowerCase()||domain.endsWith('.'+match[1].toLowerCase())&&match[1].includes('.'))))continue;
  const text=textParts(m.payload),subject=header(m,'subject');
  if(!expected.company||!subject.toLowerCase().includes(expected.company.toLowerCase())||!/security code.*application|application.*verification/i.test(subject))continue;
  const matches=[...text.matchAll(/\bcode\b[^:\n]{0,120}:\s*([A-Za-z0-9]{4,10})\b/gi)].map(m=>m[1]).filter(code=>code.length===expected.length);
  if(new Set(matches).size===1)found.push({message_id:m.id,code:matches[0]});
 }
 return found.length===1?found[0]:null;
}
function keyBytes(key){const bytes=Buffer.from(key||'','base64');if(bytes.length!==32)throw Error('Gmail encryption is not configured.');return bytes;}
export function encryptCredential(value,key=process.env.GMAIL_TOKEN_ENCRYPTION_KEY){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyBytes(key),iv);const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return {iv:iv.toString('base64'),data:data.toString('base64'),tag:cipher.getAuthTag().toString('base64')};}
export function decryptCredential(value,key=process.env.GMAIL_TOKEN_ENCRYPTION_KEY){const cipher=createDecipheriv('aes-256-gcm',keyBytes(key),Buffer.from(value.iv,'base64'));cipher.setAuthTag(Buffer.from(value.tag,'base64'));return JSON.parse(Buffer.concat([cipher.update(Buffer.from(value.data,'base64')),cipher.final()]).toString('utf8'));}
async function google(url,options={}){const response=await fetch(url,{...options,signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Gmail authorization or verification request failed (HTTP '+response.status+').');return response.json();}
export async function gmailStatus(){const {value}=await readJson('gmail-credentials.json',null);return {configured:Boolean(process.env.GOOGLE_GMAIL_CLIENT_ID&&process.env.GOOGLE_GMAIL_CLIENT_SECRET&&process.env.GMAIL_TOKEN_ENCRYPTION_KEY),connected:Boolean(value?.encrypted),account:value?.account||ACCOUNT};}
export async function beginGmailConnect(){
 if(!(await gmailStatus()).configured)throw Error('Configure the Google Gmail OAuth client and encryption key first.');
 const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
 await writeJson('gmail-oauth-state.json',{state,verifier,expires_at:Date.now()+600000});
 const params=new URLSearchParams({client_id:process.env.GOOGLE_GMAIL_CLIENT_ID,redirect_uri:CALLBACK,response_type:'code',scope:'https://www.googleapis.com/auth/gmail.readonly',access_type:'offline',prompt:'consent',login_hint:ACCOUNT,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
 return {url:'https://accounts.google.com/o/oauth2/v2/auth?'+params};
}
export async function completeGmailConnect(code,state){
 const stored=await readJson('gmail-oauth-state.json',null),pending=stored.value;
 if(!pending||pending.expires_at<Date.now()||typeof state!=='string'||state.length!==pending.state.length||!timingSafeEqual(Buffer.from(state),Buffer.from(pending.state)))throw Error('Gmail connection request expired or did not match.');
 await writeJson('gmail-oauth-state.json',null,stored.version);
 const token=await google('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:process.env.GOOGLE_GMAIL_CLIENT_ID,client_secret:process.env.GOOGLE_GMAIL_CLIENT_SECRET,redirect_uri:CALLBACK,grant_type:'authorization_code',code_verifier:pending.verifier})});
 const profile=await google('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:'Bearer '+token.access_token}});
 if(profile.emailAddress.toLowerCase()!==ACCOUNT||!token.refresh_token)throw Error('Connect mlong@magneton.io with offline read-only Gmail access.');
 await writeJson('gmail-credentials.json',{account:ACCOUNT,encrypted:encryptCredential({refresh_token:token.refresh_token}),connected_at:new Date().toISOString()});return {connected:true,account:ACCOUNT};
}
export async function fetchApplicationCode(expected){
 const stored=(await readJson('gmail-credentials.json',null)).value;if(!stored?.encrypted)return null;
 const credential=decryptCredential(stored.encrypted);
 const token=await google('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GOOGLE_GMAIL_CLIENT_ID,client_secret:process.env.GOOGLE_GMAIL_CLIENT_SECRET,refresh_token:credential.refresh_token,grant_type:'refresh_token'})});
 const headers={Authorization:'Bearer '+token.access_token};
 const after=Math.floor(Date.parse(expected.requested_at)/1000),q=`to:${ACCOUNT} after:${after} {${expected.senders.map(s=>'from:'+s).join(' ')}} subject:("security code" OR "verification")`;
 const list=await google('https://gmail.googleapis.com/gmail/v1/users/me/messages?'+new URLSearchParams({q,maxResults:'10'}),{headers});
 const messages=await Promise.all((list.messages||[]).map(m=>google('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+encodeURIComponent(m.id)+'?format=full',{headers})));
 return selectVerificationCode(messages,{...expected,recipient:ACCOUNT});
}
