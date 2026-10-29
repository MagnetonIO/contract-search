// A dispatch request is not proof that a worker acquired and started a cycle.
export function startRequestState(request,run,{now=new Date(),windowOpen=true}={}) {
 if(run?.active)return {status:'running'};
 const requested=Date.parse(request?.requested_at||'');
 if(!Number.isFinite(requested)||requested<=Date.parse(run?.started_at||'1970-01-01'))return {status:'idle'};
 if(request.status==='deferred'||!windowOpen&&!request.manual)return {status:'deferred'};
 if(request.status==='failed')return {status:'not_started'};
 return {status:now.getTime()-requested<120000?'pending':'not_started'};
}
