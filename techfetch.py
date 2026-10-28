"""Bounded public TechFetch pages; no account, private API, or access bypass."""
import json,re,time
from datetime import datetime,timezone,timedelta
from urllib.parse import urlencode,urlsplit,urlunsplit
from bs4 import BeautifulSoup
from collectors import SourceError

def parse_posting(html,url):
    soup=BeautifulSoup(html,'html.parser')
    for script in soup.select('script[type="application/ld+json"]'):
        try: data=json.loads(script.string or script.get_text())
        except (ValueError,TypeError): continue
        items=data if isinstance(data,list) else data.get('@graph',[data])
        for item in items:
            if item.get('@type')=='JobPosting':
                loc=item.get('jobLocation',{})
                return {'title':item.get('title'),'url':url,'id':re.search(r'j(\d+)',url)[1],
                    'company':item.get('hiringOrganization',{}).get('name',''),
                    'location':json.dumps(loc),'description':BeautifulSoup(item.get('description',''),'html.parser').get_text(' ',strip=True),
                    'postedDate':item.get('datePosted'),'jobType':item.get('employmentType',''),
                    'workplaceType':'remote' if item.get('jobLocationType')=='TELECOMMUTE' else ''}
    for el in soup.select('script,style,select,form select'):el.decompose()
    heading=soup.find('h1')
    if not heading: raise SourceError('TechFetch posting format changed')
    text=soup.get_text(' ',strip=True)
    body=text.partition('Job Description :')[2].partition('Similar Jobs')[0]
    if not body:raise SourceError('TechFetch description missing')
    date=re.search(r'\b(20\d{2}-\d{2}-\d{2})\b',text)
    if not date:
        date2=re.search(r'\(([A-Za-z]{3}-\d{1,2}-\d{2})\)',text)
        posted=datetime.strptime(date2[1],'%b-%d-%y').date().isoformat() if date2 else ''
    else:posted=date[1]
    salary=re.search(r'Rate/Salary \(\$\)\s*:\s*(.*?)\s*Duration',text)
    # Only posting detail sections; suggested jobs and global work-type options are excluded.
    company=soup.find('h3')
    return {'title':heading.get_text(' ',strip=True),'url':url,'id':re.search(r'j(\d+)',url)[1],
            'company':company.get_text(' ',strip=True) if company else '',
            'location':soup.find('h2').get_text(' ',strip=True) if soup.find('h2') else '',
            'description':body,'postedDate':posted,'salaryInfo':salary[1] if salary else '',
            'jobType':'Contract' if re.search(r'Consulting / Contract|CONTRACTOR',text.partition('Job Description :')[0]) else ''}

def collect(spec,smoke=False):
    from playwright.sync_api import sync_playwright, Error
    deadline=time.monotonic()+600; rows=[]; urls={}; errors=0
    queries=spec['queries'][:1] if smoke else spec['queries']
    maximum=3 if smoke else spec.get('max_items',80)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        try:
            page=browser.new_page()
            for query in queries:
                if time.monotonic()>deadline:break
                response=page.goto('https://www.techfetch.com/js/js_s_jobs.aspx?'+urlencode({'kw':'remote '+query,'loc':''}),timeout=15000)
                if response and response.status in (401,403,429):raise SourceError('TechFetch public browser access denied (HTTP '+str(response.status)+'); saved results retained')
                try:page.locator('a[href*="job-description/"]').first.wait_for(timeout=15000)
                except Error:raise SourceError('TechFetch public results unavailable or login required; saved results retained')
                links=page.locator('a[href*="job-description/"]').evaluate_all('(els)=>els.map(e=>({url:e.href,title:e.textContent}))')
                for link in links:
                    u=urlsplit(link['url']);path=re.match(r'(/job-description/.*?-j\d+)',u.path)
                    if u.hostname not in ('www.techfetch.com','techfetch.com') or not path:continue
                    urls[urlunsplit(('https',u.netloc,path[1],'',''))]=True
                time.sleep(1)
            for url in list(urls)[:maximum]:
                if time.monotonic()>deadline:break
                try:
                    page.goto(url,timeout=15000)
                    row=parse_posting(page.content(),url)
                    if row.get('postedDate') and datetime.fromisoformat(row['postedDate'][:10]).date() >= datetime.now(timezone.utc).date()-timedelta(days=7):rows.append(row)
                except (SourceError,ValueError,Error):errors+=1
                time.sleep(1)
        finally:browser.close()
    if urls and not rows and errors:raise SourceError('TechFetch posting access or parsing failed; saved results retained')
    return rows
