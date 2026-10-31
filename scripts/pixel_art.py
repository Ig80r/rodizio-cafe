"""Original pixel artwork: every shape is an integer cell; no smoothing or gradients."""
from pathlib import Path
from random import Random
root=Path(__file__).resolve().parent.parent/'assets'
rng=Random(31)
parts=[]
def rect(x,y,w,h,c): parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{c}"/>')
def cup(x,y,c):
 rect(x+2,y,2,1,'#bca69b');rect(x+3,y-2,1,2,'#bca69b');rect(x+2,y-4,1,2,'#bca69b')
 rect(x,y+3,9,7,'#1b1726');rect(x+1,y+3,6,5,c);rect(x+2,y+4,4,1,'#573830');rect(x+7,y+4,3,4,c);rect(x+8,y+5,1,2,'#372631');rect(x+1,y+8,5,2,c);rect(x-1,y+11,10,1,'#b88a60')
def plant(x,y):
 for dx,dy,w,h in [(0,0,2,12),(-5,2,5,2),(-7,0,3,3),(2,-2,5,2),(6,-4,2,3),(-3,-5,4,2),(-4,-7,2,3),(1,5,6,2),(6,3,2,3)]:rect(x+dx,y+dy,w,h,'#71875c')
 rect(x-4,y+11,10,2,'#d0a079');rect(x-3,y+13,8,6,'#9b624c');rect(x-2,y+19,6,1,'#593d3d')
rect(0,0,320,180,'#2c2330')
# brick wall with discrete grain
for y in range(0,130,8):
 for x in range(-12 if y%16 else 0,320,24):
  rect(x,y,23,7,rng.choice(['#342936','#392d38','#302633']))
  rect(x+3,y+2,4,1,'#40313c')
# rain-streaked night window
rect(17,17,135,100,'#171725');rect(20,20,129,93,'#775346');rect(23,23,123,86,'#252b43')
for x in range(25,145,12):
 h=rng.randrange(12,38);rect(x,106-h,10,h,'#191d31')
 for yy in range(108-h,100,6):
  if rng.random()>.4:rect(x+3,yy,2,2,'#9e795b')
for _ in range(45):
 x,y=rng.randrange(24,144),rng.randrange(25,100);rect(x,y,1,3,'#4b5064');rect(x-1,y+3,1,2,'#4b5064')
rect(81,23,4,86,'#775346');rect(23,64,123,4,'#775346');rect(16,110,137,5,'#ad7a57');rect(19,115,131,3,'#523a3d')
# shelves and coffee jars
for y in [47,80]:
 rect(176,y,126,4,'#9b6b4d');rect(180,y+4,118,3,'#1c1a26')
 for x in [183,202,221,262,281]:
  rect(x,y-15,10,14,'#765d50');rect(x-1,y-16,12,3,'#c19769');rect(x+2,y-9,6,5,'#d1b68d');rect(x+4,y-8,2,3,'#6c493d')
plant(243,53)
# hanging lamps
for x in [61,254]:
 rect(x,0,2,14,'#131421');rect(x-4,14,10,2,'#7c5545');rect(x-7,16,16,3,'#b98252');rect(x-10,19,22,4,'#d5a163');rect(x-8,23,18,2,'#f1ce8e')
# counter and wooden floor
rect(0,147,320,33,'#49313a')
for y in range(149,180,8):
 rect(0,y,320,1,'#765043')
 for x in range((y%3)*14,320,40):rect(x,y+1,1,7,'#2e2530')
rect(7,124,306,6,'#d0a176');rect(10,130,300,4,'#80543f');rect(13,134,294,25,'#593b37')
for x in range(16,304,18):rect(x,136,2,21,'#765045');rect(x+3,138,9,1,'#66453e')
rect(12,159,296,4,'#211d29');plant(31,100)
# espresso machine
rect(181,99,38,25,'#292937');rect(184,96,32,3,'#b1a39a');rect(185,100,29,8,'#6c737a');rect(188,102,3,3,'#e8b36f');rect(195,102,3,3,'#a2b287');rect(200,110,2,7,'#aaa59b');rect(185,120,30,3,'#a39c94')
cup(91,111,'#d7b992');cup(126,111,'#99af8a');cup(196,109,'#d7b992')
rect(264,101,21,23,'#b08051');rect(262,98,25,4,'#e0af73');rect(268,107,13,10,'#ead0a1');rect(273,109,4,6,'#634333');rect(274,110,1,4,'#b08051')
# stools, stepped silhouettes
for x in [73,139,242]:
 rect(x,150,26,3,'#c58c61');rect(x-2,153,30,4,'#825344');rect(x+3,157,3,20,'#28232c');rect(x+20,157,3,20,'#28232c');rect(x+5,168,17,2,'#825344')
(root/'cafe-pixel.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" shape-rendering="crispEdges">'+''.join(parts)+'</svg>',encoding='utf-8')
# A computational lab in the same room: warm lighting, terminals and coffee.
# Preserve cafe-pixel.svg as the original cafe illustration.
rect(174,28,130,57,'#332b37')
rect(174,28,130,2,'#79594a')
for x in [180,196,207,219]:
 rect(x,33,8,17,'#665d66');rect(x+1,34,2,14,'#a2978a');rect(x,47,8,1,'#c3ac82')
rect(176,51,126,4,'#aa7956')
rect(249,30,45,49,'#191d2b');rect(251,32,41,2,'#727581')
for y in [37,47,57,67]:
 rect(253,y,37,8,'#444653');rect(255,y+2,22,1,'#252a36');rect(255,y+4,22,1,'#252a36');rect(282,y+2,2,2,'#a6c485');rect(286,y+2,2,2,'#d9ad6e')
plant(234,60)
# monitor stations, small pixels for code and UI highlights
for x in [55,107]:
 rect(x,86,43,29,'#181c29');rect(x+1,86,41,1,'#99918b');rect(x+2,88,39,23,'#3a4a51');rect(x+3,89,37,3,'#6b7c75');rect(x+4,93,35,17,'#243640')
 for row in range(4):
  rect(x+6,95+row*3,2,1,'#718a8c');rect(x+10,95+row*3,12+(row%2)*5,1,'#96b796');rect(x+26,95+row*3,5,1,'#c4aa7a')
 rect(x+18,115,6,5,'#656575');rect(x+13,120,17,2,'#92918e');rect(x-1,123,43,2,'#544b51')
 for xx in range(x+1,x+39,3):rect(xx,123,2,1,'#b8ac9a')
# tower PC, status LEDs, cable and desk notes
rect(153,100,17,24,'#343440');rect(155,101,13,2,'#777581')
for yy in range(107,120,3):rect(156,yy,7,1,'#1d202c')
rect(165,105,2,2,'#a8c390');rect(165,109,2,1,'#d7b784')
rect(95,131,2,12,'#282431');rect(96,142,9,2,'#282431');rect(104,143,2,10,'#282431')
rect(225,116,15,7,'#d9c598');rect(227,118,9,1,'#887762');rect(227,120,6,1,'#887762')
cup(174,112,'#d7b992')
# Detail and texture use individual cells, not blurred shading.
for _ in range(90):
 x,y=rng.randrange(14,305),rng.randrange(135,158)
 rect(x,y,rng.choice([1,2,3]),1,rng.choice(['#6b483d','#805346','#4b3437']))
(root/'lab-pixel.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" shape-rendering="crispEdges">'+''.join(parts)+'</svg>',encoding='utf-8')
# Small sprites, one cell per pixel. Existing profile emoji IDs remain compatible.
patterns={
'fox':('e49a59',['..xx......xx..','.xoox....xoox.','.xoooxxxxooox.','..xooooooooox.','..xoowooowox..','..xwwxwwxwwx..','...xwwwwwwx...','....xxbbxx....','......xx......']),
'frog':('8fa968',['..xxxx..xxxx..','.xwbbxxxxbbwx.','.xoooooooooox.','xoooooooooooox','xoooxooooxooox','.xoooxxxxooox.','..xxxxxxxxxx..']),
'sloth':('ab8e78',['....xxxxxx....','..xxooooooxx..','.xoooooooooox.','.xwwxxwwxxwwx.','.xwwbbwwbbwwx.','..xwwwbbwwwx..','...xxwwwwxx...','.....xxxx.....']),
'dino':('7ca181',['....xxxxxxxx..','...xoooooooox.','...xoooboooox.','...xoooooxxxx.','.xxoooooox....','xooooooooxxx..','xoooooooox....','.xoooooox.....','..xxooxox.....','...xxx.xx.....']),
'octopus':('be829b',['....xxxxxx....','...xoooooox...','..xoooooooox..','..xowboobwox..','..xoooooooox..','...xoooooox...','.xxoxoxxoxoxx.','xoooxoxxoxooox','.xxx.xx.xx.xx.']),
'unicorn':('baa2d2',['......xx......','.....xoox.....','..xx.xoox.xx..','.xooxxxxxxoox.','..xwwwwwwwwx..','..xwbwwwwbwx..','..xwwwoowwwx..','...xwwoowwx...','....xxxxxx....']),
'panda':('ddd3c4',['.xxxx....xxxx.','xbbbbxxxxbbbbx','xbbwwwwwwwwbbx','.xwwwwwwwwwwx.','.xwbbwwwwbbwx.','.xwbbwwwwbbwx.','..xwwwbbwwwx..','...xxwwwwxx...','.....xxxx.....']),
'penguin':('7a8a9a',['....xxxxxx....','...xoooooox...','..xooooooooox.','..xowwwwwwox..','..xwbwwwwbwx..','..xwwwggwwwx..','..xwwwwwwwwx..','...xwwwwwwx...','...ggg..ggg...']),
'owl':('b38c69',['.xx........xx.','.xoxxxxxxxxox.','..xoooooooox..','.xwwwwwwwwwwx.','.xwbbwwwwbbwx.','.xwwwwggwwwwx.','..xoooooooox..','...xxooooxx...','.....xxxx.....']),
'bee':('ddba68',['..ww......ww..','.wwww....wwww.','..wwwxxxxwww..','....xoooox....','...xobbbbox...','...xoooooox...','...xobbbbox...','....xoooox....','.....xxxx.....'])}
for name,(color,rows) in patterns.items():
 colors={'x':'#201c2b','o':'#'+color,'w':'#eee0bd','b':'#302736','g':'#df9f60'}
 pixels=[f'<rect x="{x}" y="{y+2}" width="1" height="1" fill="{colors[c]}"/>' for y,row in enumerate(rows) for x,c in enumerate(row) if c!='.']
 (root/f'{name}.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" shape-rendering="crispEdges">'+''.join(pixels)+'</svg>',encoding='utf-8')
parts=[];cup(3,6,'#dfbd8c')
(root/'cup.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 20" shape-rendering="crispEdges">'+''.join(parts)+'</svg>',encoding='utf-8')

# Ceará fauna: detailed 32-cell portraits, distinct silhouettes and fur/feather shading.
def portrait(name,kind,base,light):
 global parts
 parts=[]
 dark='#302a33'; cream='#e0cba1'; shade='#796354'
 def r(x,y,w,h,c):rect(x,y,w,h,c)
 if kind=='bird':
  r(10,4,11,2,dark);r(7,6,16,12,dark);r(8,8,14,12,cream)
  r(10,5,11,5,base);r(7,9,6,3,base);r(10,12,11,2,light)
  r(19,12,7,4,'#c69757');r(23,15,3,3,'#8c6346');r(19,13,2,1,'#efd7a0')
  r(15,11,2,2,dark);r(15,11,1,1,'#fff0cc')
  r(7,18,14,9,base);r(5,21,5,7,dark);r(20,20,4,8,dark)
  for y in [20,23,26]:r(11,y,7,1,light)
  r(10,28,4,2,'#c69757');r(19,28,4,2,'#c69757')
 elif kind=='armadillo':
  r(8,8,2,7,dark);r(12,7,2,8,dark);r(9,9,1,5,light);r(13,9,1,5,light)
  r(10,14,15,3,dark);r(7,17,21,9,dark);r(9,16,15,10,base)
  r(5,20,7,5,light);r(2,23,6,2,base);r(3,23,1,1,dark);r(8,20,1,1,dark)
  for x in [13,16,19,22]:r(x,17,1,8,shade);r(x+1,18,1,6,light)
  r(11,26,3,3,shade);r(22,26,3,3,shade);r(27,24,4,2,base)
 else:
  # mammals: ears and face adapted for each silhouette
  if kind in ['fox','cat']:
   for x in [5,21]:r(x,3,5,3,dark);r(x-1,6,7,7,dark);r(x+1,5,2,6,light)
  elif kind=='marmoset':
   for x in [2,23]:
    r(x,7,7,12,cream);r(x-1,10,9,5,cream);r(x+2,8,3,10,shade)
  else:
   for x in [5,21]:r(x,5,5,2,dark);r(x-1,7,7,6,base);r(x+1,7,3,3,light)
  r(9,8,14,2,dark);r(6,10,20,13,dark);r(8,10,16,14,base);r(10,24,12,3,dark)
  r(10,11,11,3,light);r(8,14,16,8,base)
  if kind=='raccoon':r(7,14,18,5,dark)
  if kind=='cat':
   for x,y in [(9,12),(20,12),(8,19),(22,18),(11,23),(19,23)]:r(x,y,2,2,shade)
  r(9,15,4,3,cream);r(19,15,4,3,cream);r(11,15,2,2,dark);r(19,15,2,2,dark)
  r(11,19,11,5,cream);r(14,19,5,2,dark);r(16,21,1,2,shade);r(13,24,7,1,light)
  if kind=='fox':r(6,19,3,2,light);r(23,19,3,2,light)
  if kind=='marmoset':r(14,9,4,4,cream)
  r(9,27,14,3,base);r(11,27,10,1,light)
 (root/(name+'.svg')).write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">'+''.join(parts)+'</svg>',encoding='utf-8')
for args in [
 ('raposa','fox','#ad9075','#cbb08c'),('carcara','bird','#514c49','#948573'),
 ('sagui','marmoset','#8d8174','#b9ab94'),('tatu-peba','armadillo','#a58a66','#d0b482'),
 ('prea','rodent','#96795d','#bfa27a'),('moco','rodent','#8e8373','#b6ab91'),
 ('gato-do-mato','cat','#c7a471','#e0c494'),('mao-pelada','raccoon','#898176','#afa594'),
 ('coruja-buraqueira','bird','#8e7255','#c6ac80'),('bem-te-vi','bird','#9c9759','#e6ce72')]:portrait(*args)
