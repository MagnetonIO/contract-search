export const ACCOUNT_SITES={linkedin:{name:'LinkedIn',url:'https://www.linkedin.com/login'},dice:{name:'Dice',url:'https://www.dice.com/dashboard/login'}};
export function observedLogin(site,{url='',passwordVisible=false,signOutVisible=false}={}) {
 const host=site==='linkedin'?'linkedin.com':site==='dice'?'dice.com':null;
 let parsed;try{parsed=new URL(url);}catch{return 'unverified';}
 if(!host||!(parsed.hostname===host||parsed.hostname.endsWith('.'+host)))return 'unverified';
 if(passwordVisible||/\/(?:login|signin|authwall|checkpoint)(?:\/|$)/i.test(parsed.pathname))return 'needs_login';
 if(signOutVisible||site==='linkedin'&&/^\/feed(?:\/|$)/.test(parsed.pathname))return 'signed_in';
 return 'unverified';
}
