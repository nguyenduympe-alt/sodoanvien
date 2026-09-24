import random,json,os
from PIL import Image,ImageDraw,ImageFont
random.seed(11)
F='/usr/share/fonts/truetype/dejavu/'
fb=lambda s:ImageFont.truetype(F+'DejaVuSans-Bold.ttf',s); fr=lambda s:ImageFont.truetype(F+'DejaVuSans.ttf',s)
HO=['NGUYỄN','TRẦN','LÊ','PHẠM','HUỲNH','VÕ','ĐẶNG','BÙI','DƯƠNG','LÝ']; DEM=['THỊ','VĂN','NGỌC','HỮU','MINH','THANH','KIỀU','QUỐC','BẢO']; TEN=['ÁNH','TRÂM','NGHĨA','PHƯỢNG','KHOA','TUYẾT','HƯNG','LỰC','QUỲNH','ĐỨC']
out='/root/ocrtest/real'; os.makedirs(out,exist_ok=True)
for i in range(12):
    g=random.choice(['Nam','Nữ']); y=random.randint(2000,2008); d,m=random.randint(1,28),random.randint(1,12)
    cen=(2 if y>=2000 else 0)+(0 if g=='Nam' else 1)
    idn=f"{random.choice([94,92,86,79,1]):03d}{cen}{str(y)[2:]}{random.randint(0,999999):06d}"
    name=f"{random.choice(HO)} {random.choice(DEM)} {random.choice(TEN)}"; dob=f"{d:02d}/{m:02d}/{y}"
    if i%2==0:  # the Can cuoc 2024
        im=Image.new('RGB',(1300,820),(232,236,240)); D=ImageDraw.Draw(im)
        D.text((650,40),'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',font=fb(30),fill=(20,20,20),anchor='ma')
        D.text((650,82),'Độc lập - Tự do - Hạnh phúc',font=fb(24),fill=(20,20,20),anchor='ma')
        D.text((650,125),'CĂN CƯỚC',font=fb(44),fill=(180,30,30),anchor='ma')
        D.rectangle([40,210,330,600],fill=(200,205,215))
        x=370; Y=220
        D.text((x,Y),'Số định danh cá nhân/Personal identification number:',font=fr(24),fill=(60,60,60)); D.text((x,Y+34),idn,font=fb(40),fill=(10,10,10))
        D.text((x,Y+100),'Họ, chữ đệm và tên khai sinh/Full name:',font=fr(24),fill=(60,60,60)); D.text((x,Y+134),name,font=fb(36),fill=(10,10,10))
        D.text((x,Y+200),'Ngày, tháng, năm sinh/Date of birth: ',font=fr(24),fill=(60,60,60)); D.text((x+450,Y+196),dob,font=fb(30),fill=(10,10,10))
        D.text((x,Y+250),'Giới tính/Sex: ',font=fr(24),fill=(60,60,60)); D.text((x+175,Y+246),g,font=fb(30),fill=(10,10,10))
        D.text((x+330,Y+250),'Quốc tịch/Nationality: ',font=fr(24),fill=(60,60,60)); D.text((x+600,Y+246),'Việt Nam',font=fb(30),fill=(10,10,10))
    else:       # VNeID screen
        im=Image.new('RGB',(1080,1900),(255,255,255)); D=ImageDraw.Draw(im)
        D.rectangle([0,0,1080,170],fill=(200,30,40)); D.text((540,90),'Thông tin định danh',font=fb(46),fill='white',anchor='mm')
        Y=260
        for lab,val in [('Số định danh cá nhân',idn),('Họ và tên',name.title() if i%4==1 else name),('Ngày sinh',dob),('Giới tính',g),('Quốc tịch','Việt Nam'),('Quê quán','Xã An Phú, Tỉnh Sóc Trăng'),('Ngày cấp','15/08/2022')]:
            D.text((60,Y),lab,font=fr(34),fill=(110,110,110)); D.text((60,Y+52),val,font=fb(42),fill=(20,20,20)); D.line([60,Y+125,1020,Y+125],fill=(225,225,225),width=2); Y+=160
        name=name.title() if i%4==1 else name
    f=f'{out}/r{i:02d}.jpg'; im.save(f,quality=88)
    json.dump({'idNumber':idn,'fullName':name,'dob':dob,'gender':g},open(f[:-4]+'.json','w'),ensure_ascii=False)
print('ok')
