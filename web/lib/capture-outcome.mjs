import {randomUUID} from 'node:crypto';
import {writeBytes} from './store.ts';
import {evidenceText,evidenceUrl} from './outcome-evidence.mjs';
import {humanCheckText} from './visual-policy.mjs';

// Capture only the existing, permitted application page. Never navigate or
// call a model to manufacture evidence after an outcome.
export async function captureOutcome(page,attemptId,{allowed=()=>false,reason='',...detail}={}){
 const id=randomUUID(),at=new Date().toISOString(),base={id,basis:'application_browser',observed_at:at,...detail};
 if(!page)return {...base,evidence_gap:'No browser page was available at this outcome.'};
 try{
  const url=page.url();base.observed_url=evidenceUrl(url);
  if(!allowed(url)||/sign.?in|log.?in|authentication|MFA/i.test(reason)||/\/(login|signin|authwall|checkpoint|oauth|authorize)(?:\/|$)/i.test(new URL(url).pathname)||await page.locator('input[type=password]').filter({visible:true}).count())return {...base,evidence_gap:'Login, verification or an unapproved page: screenshot and page text omitted.'};
  const text=await page.locator('body').innerText({timeout:3000});
  if(humanCheckText(text))return {...base,evidence_gap:'Human verification page: screenshot and page text omitted.'};
  base.page_excerpt=evidenceText(text.slice(0,4000));
  const key='applications/'+attemptId+'/evidence/'+id+'.jpg';
  await writeBytes(key,await page.screenshot({type:'jpeg',quality:65,timeout:5000}),'image/jpeg',null);
  return {...base,screenshot_key:key,screenshot_at:at};
 }catch{return {...base,evidence_gap:'The browser page could not be captured at this outcome.'};}
}
