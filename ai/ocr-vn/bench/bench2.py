import sys,base64,time,json,glob,os
sys.path.insert(0,'/opt/ai-models/ocr-vn')
import ocr_server as S
S._load(); tot=0; tt=0; ids=0
files=sorted(glob.glob(os.environ['SET']+'/*.jpg'))
for f in files:
    gt=json.load(open(f[:-4]+'.json'))
    img=S._decode("data:image/jpeg;base64,"+base64.b64encode(open(f,'rb').read()).decode())
    t=time.time(); lines,_=S.run_ocr(img); tt+=time.time()-t
    txt=" ".join(l['text'] for l in lines).replace(' ','').upper()
    tot+=sum(1 for k in ['idNumber','fullName','dob'] if gt[k].replace(' ','').upper() in txt); ids+=gt['idNumber'] in txt
print(os.environ['SET'],"hybrid fields %d/%d ids %d/%d avg %.2fs"%(tot,3*len(files),ids,len(files),tt/len(files)))
