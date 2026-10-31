from pathlib import Path
from random import Random
from math import sqrt, sin, atan2
root=Path('assets')
rng=Random(7)
# Original logo: serif lettering against a pixel skyline, with a coffee-cup motif.
parts=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 132" role="img" aria-labelledby="title"><title id="title">Café do LSN</title><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#633b4c"/><stop offset="1" stop-color="#b98168"/></linearGradient></defs><path fill="url(#sky)" d="M0 0h300v132H0z"/>']
for _ in range(75):
 x,y=rng.randrange(300),rng.randrange(90)
 parts.append(f'<path fill="#dfc9a2" opacity="{rng.choice([.2,.3,.5])}" d="M{x} {y}h1v1h-1z"/>')
for x in range(0,300,14):
 h=rng.randrange(15,44)
 parts.append(f'<path fill="#292333" d="M{x} {132-h}h13v{h}h-13z"/>')
 for y in range(136-h,130,7):
  if rng.random()>.4:parts.append(f'<path fill="#997b62" d="M{x+4} {y}h2v2h-2z"/>')
parts.append('''<g fill="#ffffff" stroke="#30202c" stroke-width="1.5" paint-order="stroke fill" font-family="Georgia, Times New Roman, serif" style="text-shadow:1px 2px #241821"><text x="19" y="77" font-size="84">C</text><text x="76" y="58" font-size="44" letter-spacing="1">AFÉ</text><text x="106" y="93" font-size="17" font-style="italic">do</text><text x="132" y="94" font-size="42" letter-spacing="2">LSN</text></g>
<g fill="#f1e5bf" shape-rendering="crispEdges"><path d="M239 57h39v15h-3v7h-5v5h-21v-5h-5v-7h-3z"/><path d="M277 59h10v3h3v12h-3v4h-10v-4h7v-11h-7z"/><path d="M246 88h28v3h-28z"/><path fill="#916958" d="M244 57h31v3h-31z"/></g>
<path fill="#211923" d="M37 109h226v17H37z"/><text x="150" y="120" fill="#ffffff" font-family="Georgia,serif" font-size="9" font-weight="bold" text-anchor="middle" letter-spacing="1.8">CAFÉ • CÓDIGO • CONVERSA</text></svg>''')
(root/'logo-lsn.svg').write_text(''.join(parts),encoding='utf-8')
# Orthographic top-down cup: a horizontal handle with a true open center.
parts=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 100" shape-rendering="crispEdges">']
for y in range(100):
 for x in range(112):
  dx,dy=x-44,y-47;r=sqrt(dx*dx+dy*dy);color=None
  if ((x-47)/41)**2+((y-51)/40)**2<1:color='#30231d55'
  if r<40:color='#8d806b'
  if r<38:color='#c3b89d'
  if r<36:color='#eee3c7'
  if r<33:color='#d1c4a4'
  if r<31:color='#bbac8e'
  # Solid rectangular tab: the handle seen exactly from above, without an opening.
  if 69<=x<=91 and 42<=y<=52:color='#e4d8b8'
  if 70<=x<=90 and y==42:color='#f6edcf'
  if 70<=x<=90 and y==52:color='#baa988'
  if r<29:color='#f6ecd1'
  if r<27:color='#d5c6a5'
  if r<25:color='#a98861'
  if r<23:color='#5d3d2c'
  if r<21:color='#39271f'
  if 18+sin(atan2(dy,dx)*3)<r<22:color='#a27549'
  if ((x-35)/8)**2+((y-36)/4)**2<1:color='#bd955f'
  if ((x-38)/7)**2+((y-38)/4)**2<1:color='#67442c'
  if color:parts.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{color}"/>')
parts.append('</svg>');(root/'coffee-top.svg').write_text(''.join(parts),encoding='utf-8')

# Reuse the precise cup paths from the initial logo for the newspaper masthead.
logo=(root/'logo-lsn.svg').read_text(encoding='utf-8')
start=logo.index('<g fill="#f1e5bf" shape-rendering="crispEdges">')
end=logo.index('</g>',start)+4
(root/'logo-cup.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="235 53 60 42">'+logo[start:end]+'</svg>',encoding='utf-8')
