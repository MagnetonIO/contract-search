// A client-side field error is retryable only when this click produced no
// network write or navigation. Any ambiguity keeps submission protection.
export function watchSubmission(context,{previousErrors=[]}={}){
 let changed=false;
 const request=r=>{try{if(!['GET','HEAD','OPTIONS'].includes(r.method())||r.isNavigationRequest())changed=true;}catch{changed=true;}};
 context.on('request',request);
 return {rejected:errors=>!changed&&errors.some(error=>!previousErrors.includes(error)),dispose:()=>context.off('request',request)};
}
