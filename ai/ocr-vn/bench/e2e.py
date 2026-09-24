import json,glob,base64,urllib.request,time,os,sys
B='http://127.0.0.1:3000/api'
def post(u,d,tok=None):
    r=urllib.request.Request(B+u,data=json.dumps(d).encode(),headers={'Content-Type':'application/json',**({'Authorization':'Bearer '+tok} if tok else {})})
    try: return json.load(urllib.request.urlopen(r,timeout=120))
    except urllib.error.HTTPError as e: return {'HTTP':e.code,'body':e.read().decode()[:300]}
tok=post('/auth/login',{'username':'chidoan01','password':'123456'}).get('token')
st=json.load(urllib.request.urlopen(urllib.request.Request(B+'/intake/status',headers={'Authorization':'Bearer '+tok})))
print('status:',st['provider'],st['offlineEngine'])
tot=ok=autos=0
for d in sys.argv[1:]:
  for f in sorted(glob.glob(d+'/*.jpg')):
    gt=json.load(open(f[:-4]+'.json')); dd,mm,yy=gt['dob'].split('/')
    t=time.time(); r=post('/intake/extract',{'image':'data:image/jpeg;base64,'+base64.b64encode(open(f,'rb').read()).decode()},tok); dt=time.time()-t
    fl=r.get('fields',{}); 
    good=[fl.get('idNumber')==gt['idNumber'], (fl.get('fullName') or '').upper()==gt['fullName'].upper(), fl.get('dob')==f'{yy}-{mm}-{dd}', fl.get('gender')==gt['gender']]
    tot+=4; ok+=sum(good); elig=r.get('autoDecision',{}).get('auto')
    wrong_but_auto = elig and not all(good)
    print(f"{os.path.basename(f):18s} {sum(good)}/4 conf={fl.get('confidence')} {dt:.1f}s model={r.get('model')} autoOK={elig}{' <<WRONG-BUT-AUTO' if wrong_but_auto else ''} {'' if all(good) else fl} {r.get('error','')}")
print(f"TOTAL {ok}/{tot}")
