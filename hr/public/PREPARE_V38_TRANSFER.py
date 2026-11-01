#!/usr/bin/env python3
"""Run next to maskan_hr.sqlite3. Read-only export; does not change the HR app."""
from pathlib import Path
import sqlite3,tempfile,json,hashlib,zipfile,datetime,sys

def clean(value):
 if isinstance(value,dict):return {k:clean(v) for k,v in value.items() if not any(x in k.lower() for x in ('password','secret','token'))}
 if isinstance(value,list):return [clean(v) for v in value]
 if isinstance(value,str) and value[:1] in ('{','['):
  try:return json.dumps(clean(json.loads(value)),ensure_ascii=False)
  except (ValueError,TypeError):pass
 return value

def main():
 root=Path(__file__).resolve().parent
 db=root/'maskan_hr.sqlite3'
 if not db.exists():raise RuntimeError('Place this script next to maskan_hr.sqlite3 in the current Python platform folder.')
 with tempfile.TemporaryDirectory(prefix='maskan_export_') as td:
  snapshot=Path(td)/'snapshot.sqlite3'
  with sqlite3.connect('file:'+db.as_posix()+'?mode=ro',uri=True) as src,sqlite3.connect(snapshot) as dst:src.backup(dst)
  c=sqlite3.connect(snapshot);c.row_factory=sqlite3.Row
  if c.execute('pragma integrity_check').fetchone()[0]!='ok':raise RuntimeError('Database integrity check failed; export stopped.')
  tables={}
  for name, in c.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%'"):
   rows=[]
   for r in c.execute('select * from "'+name.replace('"','""')+'"'):
    rows.append(clean({k:(v.hex() if isinstance(v,bytes) else v) for k,v in dict(r).items()}))
   tables[name]=rows
  c.close();source='v38-'+hashlib.sha256(snapshot.read_bytes()).hexdigest()[:20]
  stamp=datetime.datetime.now().strftime('%Y%m%d_%H%M%S');output=root/('Maskan_V38_Transfer_'+stamp+'.zip')
  attachments=root/'private_attachments';files=[]
  with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
   if attachments.is_dir():
    for p in attachments.rglob('*'):
     if not p.is_file() or p.is_symlink():continue
     try:rel=p.resolve().relative_to(attachments.resolve())
     except ValueError:continue
     entry='files/'+rel.as_posix();data=p.read_bytes();z.writestr(entry,data);files.append({'path':entry,'storage_key':rel.as_posix(),'size':len(data),'sha':hashlib.sha256(data).hexdigest()})
   manifest={'format':'maskan-v38-transfer-v1','source':source,'exported_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'tables':tables,'files':files,'summary':{name:len(rows) for name,rows in tables.items()}}
   z.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False,default=str))
  print('Created:',output.name);print('Employees:',len(tables.get('employees',[])),'Attachments:',len(files));print('Upload this ZIP in the cloud Migration window. No passwords were exported.')
if __name__=='__main__':
 try:main()
 except Exception as exc:print('EXPORT FAILED:',exc);sys.exit(1)
