"""Persistent SAM.gov request quota, response cache, and 429 cooldown."""
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import time
from collectors import SourceError


class SamDeferred(SourceError):
    pass


class SamQuota:
    def __init__(self, path, key, limit=10, persist=None):
        self.path=str(path);self.account=hashlib.sha256(key.encode()).hexdigest()
        self.limit=min(10,max(1,int(limit)));self.persist=persist;self.cache_hits=0
        Path(self.path).parent.mkdir(parents=True,exist_ok=True)
        with closing(sqlite3.connect(self.path)) as db, db:
            db.executescript('CREATE TABLE IF NOT EXISTS requests(account TEXT, stamp REAL); CREATE TABLE IF NOT EXISTS cache(account TEXT, query TEXT, stamp REAL, payload TEXT, PRIMARY KEY(account,query)); CREATE TABLE IF NOT EXISTS cooldown(account TEXT PRIMARY KEY, until REAL);')

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
                raise SamDeferred('SAM.gov rate limited; requests paused until '+datetime.fromtimestamp(deferred[0],timezone.utc).isoformat())
            if count>=self.limit:
                raise SamDeferred('SAM.gov rolling 24-hour request allowance reached; cached results retained')
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
                raise SamDeferred('SAM.gov HTTP 429; requests paused until '+datetime.fromtimestamp(until,timezone.utc).isoformat()) from None
            raise
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute('INSERT OR REPLACE INTO cache VALUES (?,?,?,?)',(self.account,query,now,json.dumps(data)))
        return data
