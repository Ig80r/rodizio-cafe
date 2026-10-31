"""Scientific coffee-lab scene, with discrete pixel animation and a still version."""
from pathlib import Path
from random import Random
root=Path(__file__).resolve().parent.parent/'assets'
base=(root/'cafe-pixel.svg').read_text(encoding='utf-8')
p=[base[base.index('>')+1:base.rindex('</svg>')]]
def r(x,y,w,h,c):p.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{c}"/>')
def group(cls):p.append(f'<g class="{cls}">')
def end():p.append('</g>')
# Maxwell, Shannon entropy (bits), and outward field lines of a positive charge.
r(160,26,85,57,'#a77d56');r(163,29,79,50,'#273c3b');r(164,30,77,1,'#58716a');r(160,80,86,3,'#be9568')
p.append('<g fill="#d5d7bb" font-family="Georgia, serif" font-size="5.5"><text x="168" y="39">∇·E = ρ/ε₀</text><text x="168" y="49">∇·B = 0</text><text x="168" y="59">∇×E = −∂B/∂t</text><text x="168" y="73">H(X) = −Σ pᵢ log₂ pᵢ</text></g>')
p.append('<circle cx="225" cy="48" r="9" fill="none" stroke="#78988b" stroke-dasharray="2 2" stroke-width=".6"/><path d="M222 48h6M225 45v6 M225 42V34m-2 3 2-3 2 3 M225 54v8m-2-3 2 3 2-3 M219 48h-8m3-2-3 2 3 2 M231 48h8m-3-2 3 2-3 2" fill="none" stroke="#d8c392" stroke-width=".7"/>')
r(229,79,7,1,'#e1d9bc');r(217,79,5,1,'#d0b58e')
# A small server shelf, away from the coffee preparation area.
r(249,29,45,52,'#272b38')
for y in [34,45,56,67]:
 r(252,y,39,9,'#50505d');r(255,y+2,23,1,'#222733');r(255,y+5,23,1,'#222733');r(282,y+3,2,2,'#aabd8b')
# Two open laptops: screen hinges connect directly to keyboard decks, no stands.
for x in [60,111]:
 r(x,98,39,24,'#202631');r(x+1,98,37,1,'#c2c1b5');r(x+2,100,35,19,'#52696b');r(x+3,101,33,17,'#243c43')
 r(x-2,122,43,1,'#e0d5bd');r(x-4,123,47,2,'#a9acaa');r(x-2,125,43,1,'#5f6970')
 for yy in [122,124]:
  for xx in range(x+2,x+36,3):r(xx,yy,2,1,'#58636b')
 r(x+16,124,8,1,'#c6c7bd')
for row in range(4):
 r(66,104+row*3,3,1,'#849a97');r(72,104+row*3,12+(row%2)*5,1,'#b4c79a')
for x in range(116,145,5):r(x,102,1,15,'#365259')
for y in [104,109,114]:r(115,y,30,1,'#365259')
group('wave');p.append('<path d="M115 110h3v-3h3v-3h3v4h3v7h3v-3h3v-6h3v1h3v5h5" fill="none" stroke="#bad7aa" stroke-width="1"/>');end()
group('cursor');r(89,115,3,1,'#dfdcb0');end()
group('leds');r(282,37,2,2,'#c5dcaa');r(282,59,2,2,'#c5dcaa');end()
# Short Black scientist in three-quarter profile, facing the coffee machine.
# Compact silhouette, individually clustered curls and visible side-on glasses.
r(229,96,15,10,'#714735');r(227,99,4,6,'#714735');r(232,105,7,4,'#69402f')
r(227,99,2,2,'#b47b55');r(242,99,3,4,'#915b40');r(231,104,5,1,'#b37a56')
for x,y in [(229,88),(234,87),(239,88),(225,91),(230,91),(235,90),(240,91),(243,94),(226,95),(231,94),(237,94),(242,97)]:
 r(x,y,4,4,'#231f28');r(x+1,y,2,1,'#4d3834')
r(226,97,8,4,'#c6b286');r(227,98,5,2,'#a77352');r(228,99,1,1,'#30252a');r(230,98,1,1,'#e3d5b3');r(234,98,8,1,'#c6b286');r(225,100,2,1,'#c6b286')
r(229,109,16,14,'#719389');r(226,111,5,10,'#547a74');r(240,110,6,13,'#42675f');r(231,109,2,14,'#a9b3a0');r(235,110,4,13,'#d6c3a0')
group('pouring')
r(218,110,11,4,'#714735');r(216,109,4,5,'#a06a4c')
# A small stainless kettle held beside the coffee machine.
r(207,105,10,2,'#cad1c5');r(205,107,14,8,'#9baea8');r(207,115,10,2,'#627a7a');r(206,108,2,5,'#dbe0ce');r(202,108,4,3,'#a7bab0');r(200,105,3,4,'#a7bab0');r(198,102,3,4,'#c5d3c4');r(197,101,4,2,'#e0e3cd');r(217,106,4,2,'#d0c5a7');r(220,108,2,5,'#d0c5a7');r(218,113,3,2,'#d0c5a7')
end()
group('drip');r(197,106,1,10,'#bd9d6c');end()
# More nuanced ceramic cups: visible coffee ellipse, curved stepped body, open handle.
def detailed_cup(x,y,c):
 r(x-2,y+12,18,1,'#61483d');r(x,y+11,14,1,'#c2ad8a');r(x+2,y,9,1,'#f0e1be');r(x,y+1,13,2,c)
 r(x+1,y+3,11,6,c);r(x+2,y+9,9,1,'#b7a587');r(x+4,y+10,5,1,'#8e7c68')
 r(x+2,y+1,9,2,'#4c3228');r(x+3,y+1,7,1,'#98704b');r(x+1,y+3,2,5,'#f2e6c9');r(x+10,y+3,2,5,'#b2a28a')
 r(x+12,y+3,4,1,c);r(x+15,y+4,2,3,c);r(x+12,y+7,4,1,c);r(x+13,y+4,2,3,'#302a30')
detailed_cup(192,117,'#e2d0ab');detailed_cup(156,114,'#c8d4bd')
# Larger plant and books on a wall shelf.
r(5,46,9,39,'#5b4650')
for y,c in [(48,'#989379'),(58,'#99816f'),(69,'#6c8b83')]:r(6,y,6,8,c);r(7,y+2,1,5,'#c1b398')
# Animated steam is drawn as separate stepped wisps; use two out-of-phase layers.
for x,delay in [(161,'0s'),(197,'1.4s')]:
 p.append(f'<g class="steam" style="animation-delay:{delay}">')
 r(x,106,1,4,'#d8c8ad');r(x+1,103,1,3,'#d8c8ad');r(x,101,1,2,'#d8c8ad');end()
# Rain restricted to the window, with no motion outside the pane.
p.append('<defs><clipPath id="rain-pane"><path d="M24 25h88v38H24z M24 68h9v36h-9z M85 68h28v14H85z"/></clipPath></defs><g clip-path="url(#rain-pane)"><g class="rain">')
rng=Random(42)
for _ in range(24):
 x,y=rng.randrange(25,111),rng.randrange(16,102);r(x,y,1,3,'#78818f');r(x-1,y+3,1,2,'#78818f')
p.append('</g></g>')
style='''<style>
.steam{animation:steam 3.6s steps(6,end) infinite;opacity:.65}.rain{animation:rain 1.8s steps(8,end) infinite;opacity:.45}.cursor{animation:cursor 2s steps(1,end) infinite}.leds{animation:leds 4s steps(1,end) infinite}.wave{animation:wave 2.4s steps(3,end) infinite}.pouring{animation:pouring 4s steps(2,end) infinite;transform-origin:218px 111px}.drip{animation:drip 4s steps(1,end) infinite}
@keyframes steam{0%{transform:translateY(2px);opacity:0}30%{opacity:.65}100%{transform:translateY(-7px);opacity:0}}
@keyframes rain{to{transform:translate(-3px,9px)}}@keyframes cursor{50%{opacity:0}}@keyframes leds{50%{opacity:.35}}@keyframes wave{50%{transform:translateY(1px)}}@keyframes pouring{30%,65%{transform:rotate(-3deg)}}@keyframes drip{0%,25%,75%,100%{opacity:0}30%,70%{opacity:1}}
@media(prefers-reduced-motion:reduce){.steam,.rain,.cursor,.leds,.wave,.pouring,.drip{animation:none}.drip{opacity:0}}
</style>'''
head='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" shape-rendering="crispEdges">'
(root/'science-lab.svg').write_text(head+''.join(p)+'</svg>',encoding='utf-8')
(root/'science-lab-animated.svg').write_text(head+style+''.join(p)+'</svg>',encoding='utf-8')
