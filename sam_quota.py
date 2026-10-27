"""Persistent SAM.gov request quota, response cache, and 429 cooldown."""
from contextlib import closing
from datetime import datetime, timezone, timedelta
import hashlib
import json
from pathlib import Path
import sqlite3
import time
from collectors import SourceError


class SamDeferred(SourceError):
    def __init__(self, message, retry_at=None):
        super().__init__(message)
        self.retry_at = retry_at


def search_queries(titles, now):
    return [{'postedFrom':(now-timedelta(days=7)).strftime('%m/%d/%Y'),
             'postedTo':now.strftime('%m/%d/%Y'), 'title':title,
             'limit':'1000', 'offset':'0'} for title in titles[:3]]


def eligible_at(db, account, limit, params, now):
    missing = sum(not db.execute('SELECT 1 FROM cache WHERE account=? AND query=? AND stamp>?',
                  (account,json.dumps(p,sort_keys=True),now-86400)).fetchone() for p in params)
    if not missing:
        return now
    if missing > limit:
        raise SourceError('SAM query plan exceeds the configured request allowance')
    cooldown = db.execute('SELECT until FROM cooldown WHERE account=?',(account,)).fetchone()
    stamps = [r[0] for r in db.execute('SELECT stamp FROM requests WHERE account=? AND stamp>? ORDER BY stamp',(account,now-86400))]
    wait = stamps[len(stamps)+missing-limit-1]+86400 if len(stamps)+missing>limit else now
    return max(now, wait, cooldown[0] if cooldown else now)


def next_eligible_from_file(path, titles, limit=10, now=None):
    now=time.time() if now is None else now
    path=Path(path)
    if not path.exists(): return now
    with closing(sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True)) as db:
        account=db.execute('SELECT account FROM requests ORDER BY stamp DESC LIMIT 1').fetchone()
        if not account: account=db.execute('SELECT account FROM cooldown ORDER BY until DESC LIMIT 1').fetchone()
        return eligible_at(db,account[0],min(10,limit),search_queries(titles,datetime.fromtimestamp(now,timezone.utc)),now) if account else now



class SamQuota:
    def __init__(self, path, key, limit=10, persist=None):
        self.path=str(path);self.account=hashlib.sha256(key.encode()).hexdigest()
        self.limit=min(10,max(1,int(limit)));self.persist=persist;self.cache_hits=0
        Path(self.path).parent.mkdir(parents=True,exist_ok=True)
        with closing(sqlite3.connect(self.path)) as db, db:
            db.executescript('CREATE TABLE IF NOT EXISTS requests(account TEXT, stamp REAL); CREATE TABLE IF NOT EXISTS cache(account TEXT, query TEXT, stamp REAL, payload TEXT, PRIMARY KEY(account,query)); CREATE TABLE IF NOT EXISTS cooldown(account TEXT PRIMARY KEY, until REAL);')

    def preflight(self, params, now=None):
        now=time.time() if now is None else now
        with closing(sqlite3.connect(self.path)) as db:
            retry_at=eligible_at(db,self.account,self.limit,params,now)
        if retry_at>now:
            raise SamDeferred('SAM.gov refresh scheduled when its request allowance is available',retry_at)

    def query(self, params, send, now=None):
        now=time.time() if now is None else now
        query=json.dumps(params,sort_keys=True)
        with closing(sqlite3.connect(self.path,timeout=30)) as db, db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('DELETE FROM requests WHERE stamp<=?',(now-86400,))
            db.execute('DELETE FROM cache WHERE stamp<=?',(now-86400,))
            cached=db.execute('SELECT payload FROM cache WHERE account=? AND query=? AND stamp>?',(self.account,query,now-86400)).fetchone()
            if cached:
                self.cache_hits+=1
                return json.loads(cached[0])
            deferred=db.execute('SELECT until FROM cooldown WHERE account=?',(self.account,)).fetchone()
            count=db.execute('SELECT COUNT(*) FROM requests WHERE account=? AND stamp>?',(self.account,now-86400)).fetchone()[0]
            if deferred and deferred[0]>now:
                raise SamDeferred('SAM.gov refresh paused until its cooldown ends',deferred[0])
            if count>=self.limit:
                raise SamDeferred('SAM.gov rolling 24-hour request allowance reached; cached results retained',eligible_at(db,self.account,self.limit,[params],now))
            db.execute('INSERT INTO requests VALUES (?,?)',(self.account,now))
        if self.persist:self.persist()
        try:
            data=send()
        except SourceError as exc:
            if str(exc)=='HTTP 429':
                until=max(now+60, now+getattr(exc,'retry_after_seconds',3600))
                with closing(sqlite3.connect(self.path)) as db, db:
                    db.execute('INSERT OR REPLACE INTO cooldown VALUES (?,?)',(self.account,until))
                if self.persist:self.persist()
                raise SamDeferred('SAM.gov refresh paused by the provider; saved results retained',until) from None
            raise
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute('INSERT OR REPLACE INTO cache VALUES (?,?,?,?)',(self.account,query,now,json.dumps(data)))
        return data
