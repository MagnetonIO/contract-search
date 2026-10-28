import { NextResponse } from 'next/server';
import { readJson, writeJson, ConflictError } from '../../../../lib/store';
import { mergeEmailLeads, validImportToken } from '../../../../lib/email-import.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (value:unknown,status=200) => NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request:Request) {
  try {
    const config = await readJson<{token:string}|null>('email-import-config.json',null);
    if (!validImportToken(request.headers.get('authorization')?.replace(/^Bearer /,''),config.value?.token)) return reply({error:'Unauthorized'},401);
    // Bound actual bytes, including requests without Content-Length.
    const reader = request.body?.getReader(); if (!reader) return reply({error:'Body required'},400);
    const chunks:Uint8Array[]=[]; let size=0;
    while(true) { const {done,value}=await reader.read(); if(done)break; size+=value.length;if(size>750000){await reader.cancel();return reply({error:'Import too large'},413);}chunks.push(value); }
    const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!Array.isArray(input.messages)||input.messages.length>10) return reply({error:'Invalid batch'},400);
    for(let attempt=0;attempt<4;attempt++) {
      const old=await readJson('email-leads.json',null);
      const next=mergeEmailLeads(old.value,input.messages);
      try { await writeJson('email-leads.json',next,old.version);return reply({count:next.leads.length}); }
      catch(error){if(!(error instanceof ConflictError))throw error;}
    }
    return reply({error:'Retry import'},409);
  } catch(error) {return reply({error:error instanceof SyntaxError?'Invalid JSON':'Import unavailable; saved results preserved'},400);}
}
