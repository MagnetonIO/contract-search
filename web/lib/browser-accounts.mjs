export const ACCOUNT_SITES={linkedin:{name:'LinkedIn',host:'linkedin.com',url:'https://www.linkedin.com/login',verifyUrl:'https://www.linkedin.com/feed/'},dice:{name:'Dice',host:'dice.com',url:'https://www.dice.com/dashboard/login',verifyUrl:'https://www.dice.com/dashboard'},indeed:{name:'Indeed',host:'indeed.com',url:'https://secure.indeed.com/auth'},glassdoor:{name:'Glassdoor',host:'glassdoor.com',url:'https://www.glassdoor.com/member/profile/login'}};
export const LOGIN_TIMEOUT_SECONDS=900;
export function siteForUrl(url){try{const u=new URL(url);return Object.entries(ACCOUNT_SITES).find(([,s])=>u.protocol==='https:'&&(u.hostname===s.host||u.hostname.endsWith('.'+s.host)))?.[0]||null;}catch{return null;}}
export function loginExpiresAt(login){return login?.expires_at||new Date(Date.parse(login?.opened_at||'1970-01-01')+(login?.timeout_seconds||300)*1000).toISOString();}
export function loginIsActive(login,now=Date.now()){return Boolean(login&&Date.parse(loginExpiresAt(login))>now);}
export function observedLogin(site,{url='',passwordVisible=false,signOutVisible=false,accountNavVisible=false}={}) {
 let parsed;try{parsed=new URL(url);}catch{return 'unverified';}
 if(siteForUrl(url)!==site)return 'unverified';
 if(passwordVisible||/\/(?:login|signin|authwall|checkpoint|auth)(?:\/|$)|\/login_input\.htm/i.test(parsed.pathname))return 'needs_login';
 if(signOutVisible||site==='linkedin'&&accountNavVisible&&/^\/feed(?:\/|$)/.test(parsed.pathname))return 'signed_in';
 if(site==='dice'&&accountNavVisible&&/^\/profile(?:\/|$)/.test(parsed.pathname))return 'signed_in';
 return 'unverified';
}
