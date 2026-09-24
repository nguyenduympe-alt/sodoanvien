import glob,json,random,os,io
import numpy as np, cv2
random.seed(7); np.random.seed(7)
src=sorted(glob.glob('/root/ocrtest/cards/*.jpg')); out='/root/ocrtest/hard'; os.makedirs(out,exist_ok=True)
for f in src:
    img=cv2.imread(f); h,w=img.shape[:2]
    for v in range(2):
        s=random.uniform(0.45,0.7); im=cv2.resize(img,(int(w*s),int(h*s)),interpolation=cv2.INTER_AREA)
        hh,ww=im.shape[:2]; B=int(ww*0.25)
        bg=np.full((hh+2*B,ww+2*B,3),random.randint(60,160),np.uint8); bg=cv2.add(bg,np.random.randint(0,40,bg.shape,dtype=np.uint8))
        j=lambda: random.uniform(-0.07,0.07)*ww
        srcp=np.float32([[0,0],[ww,0],[ww,hh],[0,hh]])
        dst=np.float32([[B+j(),B+j()],[B+ww+j(),B+j()],[B+ww+j(),B+hh+j()],[B+j(),B+hh+j()]])
        M=cv2.getPerspectiveTransform(srcp,dst)
        warped=cv2.warpPerspective(im,M,(bg.shape[1],bg.shape[0]))
        mask=cv2.warpPerspective(np.full((hh,ww),255,np.uint8),M,(bg.shape[1],bg.shape[0]))
        bg[mask>0]=warped[mask>0]
        # glare
        gx,gy=random.randint(0,bg.shape[1]),random.randint(0,bg.shape[0])
        Y,X=np.ogrid[:bg.shape[0],:bg.shape[1]]
        g=np.exp(-((X-gx)**2+(Y-gy)**2)/(2*(bg.shape[1]*0.12)**2))*random.uniform(60,110)
        bg=np.clip(bg.astype(float)+g[...,None],0,255).astype(np.uint8)
        bg=cv2.GaussianBlur(bg,(0,0),random.uniform(0.8,1.5))
        bg=np.clip(bg.astype(float)+np.random.normal(0,6,bg.shape),0,255).astype(np.uint8)
        name=f'{out}/{os.path.basename(f)[:-4]}-{v}.jpg'
        cv2.imwrite(name,bg,[cv2.IMWRITE_JPEG_QUALITY,random.randint(35,60)])
        os.system(f'cp {f[:-4]}.json {name[:-4]}.json')
print('ok',len(glob.glob(out+'/*.jpg')))
