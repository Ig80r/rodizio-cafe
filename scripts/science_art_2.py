"""Second lab scene: a seated researcher scrolling his phone, with a timed pixel speech bubble."""
from copy import deepcopy
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'assets'
NS = '{http://www.w3.org/2000/svg}'
ET.register_namespace('', NS[1:-1])


def group(parent, **attributes):
    return ET.SubElement(parent, NS + 'g', attributes)


def rectangle(parent, x, y, width, height, color):
    ET.SubElement(parent, NS + 'rect', {
        'x': str(x), 'y': str(y), 'width': str(width), 'height': str(height), 'fill': color
    })


def blocks(parent, color, coordinates):
    for x, y, width, height in coordinates:
        rectangle(parent, x, y, width, height, color)


character = ET.Element(NS + 'g', {'id': 'phone-researcher', 'transform': 'translate(-40 0)', 'aria-label': 'Pesquisador de cabelo cacheado, óculos redondos, barba e camiseta verde sentado usando o celular'})
# The original left stool is repositioned in the scene below; no extra chair.
# Hips and thighs sit just above its existing seat at y=150.
blocks(character, '#303b48', [(79, 142, 21, 8), (89, 148, 7, 23)])
blocks(character, '#4b5866', [(90, 153, 2, 16)])
blocks(character, '#24232b', [(89, 170, 7, 5), (92, 172, 9, 3)])
rectangle(character, 89, 175, 12, 1, '#79726d')
blocks(character, '#3b4653', [(82, 143, 23, 7), (102, 145, 8, 9), (103, 153, 7, 18)])
blocks(character, '#5b6571', [(85, 144, 17, 2), (104, 147, 4, 3), (104, 154, 2, 15)])
blocks(character, '#29323e', [(100, 148, 2, 3), (108, 154, 2, 16)])
blocks(character, '#24232b', [(103, 170, 7, 5), (106, 172, 10, 3)])
rectangle(character, 103, 175, 13, 1, '#79726d')
upper_body = group(character, transform='translate(0 -7)')
# Olive T-shirt curves over a small seated belly, with a shaded lower hem.
blocks(upper_body, '#606c43', [(77, 125, 20, 22), (73, 128, 7, 12), (95, 127, 7, 12), (96, 135, 6, 4), (96, 139, 9, 8), (80, 145, 23, 4), (84, 149, 16, 1)])
blocks(upper_body, '#788056', [(79, 126, 5, 18), (75, 129, 3, 8), (86, 145, 13, 2)])
blocks(upper_body, '#6d784a', [(96, 138, 5, 5), (99, 142, 4, 4)])
blocks(upper_body, '#424e35', [(92, 129, 3, 7), (79, 139, 2, 7), (96, 133, 5, 3), (81, 147, 4, 2), (85, 149, 15, 1), (100, 147, 3, 1)])
blocks(upper_body, '#ab7c63', [(84, 120, 8, 8), (74, 133, 6, 7), (78, 136, 15, 5), (98, 133, 10, 6)])
blocks(upper_body, '#c49879', [(85, 121, 6, 5), (75, 134, 3, 4), (82, 136, 11, 3), (102, 132, 6, 5)])
blocks(upper_body, '#3e4a33', [(82, 126, 3, 2), (85, 128, 5, 2), (90, 126, 3, 2)])
# A three-quarter face, with a readable nose and warm cheek planes.
blocks(upper_body, '#b58a72', [(75, 106, 23, 15), (78, 120, 17, 5), (73, 112, 4, 7), (97, 114, 5, 5)])
blocks(upper_body, '#d0a68a', [(80, 107, 15, 8), (78, 114, 4, 5), (96, 114, 4, 3)])
blocks(upper_body, '#956d59', [(75, 112, 2, 7), (78, 119, 4, 4), (95, 117, 3, 5)])
# Beard and moustache use stepped clusters, leaving the mouth visible.
blocks(upper_body, '#483832', [(78, 118, 3, 5), (81, 121, 16, 4), (84, 124, 10, 3), (95, 118, 3, 6), (85, 118, 10, 2)])
blocks(upper_body, '#6a5143', [(79, 120, 2, 3), (83, 124, 3, 1), (91, 122, 3, 1), (96, 120, 1, 2)])
rectangle(upper_body, 86, 120, 7, 1, '#d5a18a')
# Individually clustered curls, with scattered reflected light.
for x, y, width, height in [(75, 100, 7, 7), (81, 96, 7, 9), (88, 97, 7, 8), (94, 101, 7, 8), (71, 104, 7, 9), (78, 102, 9, 7), (85, 102, 9, 7), (93, 106, 6, 6), (74, 110, 3, 5)]:
    rectangle(upper_body, x, y, width, height, '#302c2e')
blocks(upper_body, '#5d514a', [(77, 101, 3, 1), (83, 97, 3, 2), (90, 99, 3, 1), (96, 103, 2, 2), (72, 106, 2, 2), (81, 104, 3, 1), (90, 105, 2, 1)])
# Clear round prescription lenses: stepped rims and visible eyes, no dark lenses.
for x in [77, 89]:
    ET.SubElement(upper_body, NS + 'path', {
        'fill': '#292a2d', 'fill-rule': 'evenodd',
        'd': f'M{x+2} 110h6v1h2v6h-2v1h-6v-1h-2v-6h2z M{x+2} 112v4h6v-4z'
    })
    rectangle(upper_body, x + 2, 112, 6, 4, '#c5b7a2')
    rectangle(upper_body, x + 3, 112, 4, 3, '#bd9276')
    rectangle(upper_body, x + 5, 114, 1, 1, '#34292a')
    rectangle(upper_body, x + 2, 112, 2, 1, '#e0d8bd')
rectangle(upper_body, 86, 112, 3, 1, '#292a2d')
rectangle(upper_body, 73, 110, 4, 1, '#292a2d')
# A vertical phone held in front of the chest, with lit screen and scrolling thumb.
phone = group(upper_body, **{'class': 'phone-screen', 'transform': 'translate(0 -4)'})
blocks(phone, '#242a34', [(105, 128, 9, 16), (106, 127, 7, 1)])
blocks(phone, '#779fa4', [(107, 130, 5, 10)])
blocks(phone, '#c4d7c5', [(108, 131, 3, 2), (108, 135, 3, 1)])
rectangle(phone, 108, 138, 2, 1, '#a4c0af')
rectangle(phone, 109, 142, 2, 1, '#566774')
blocks(upper_body, '#b58a72', [(104, 136, 3, 4), (112, 133, 2, 6), (91, 137, 14, 4)])
thumb = group(upper_body, **{'class': 'phone-thumb'})
blocks(thumb, '#cfa183', [(106, 132, 4, 2), (104, 134, 3, 3)])

bubble = ET.Element(NS + 'g', {'class': 'ai-ai-bubble', 'transform': 'translate(-62 -18)', 'role': 'img', 'aria-label': 'AI AI'})
ET.SubElement(bubble, NS + 'title').text = 'AI AI'
ET.SubElement(bubble, NS + 'path', {'fill': '#302a32', 'd': 'M103 77h42v2h2v18h-2v2h-31v4h-3v-4h-8v-2h-2V79h2z'})
ET.SubElement(bubble, NS + 'path', {'fill': '#f0e3be', 'd': 'M104 79h40v2h1v14h-2v2h-31v3h-1v-3h-7v-2h-1V81h1z'})
# 5x7 pixel lettering stays crisp at the scene's native 320x180 resolution.
glyphs = {'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
          'I': ['11111', '00100', '00100', '00100', '00100', '00100', '11111']}
cursor = 109
for letter in 'AI AI':
    if letter == ' ':
        cursor += 3
        continue
    for y, row in enumerate(glyphs[letter]):
        for x, pixel in enumerate(row):
            if pixel == '1':
                rectangle(bubble, cursor + x, 84 + y, 1, 1, '#453637')
    cursor += 7

animation = '''
.phone-screen { animation: phone-screen-light 4s steps(2,end) infinite; }
.phone-thumb { animation: phone-scroll 2.8s steps(1,end) infinite; }
.ai-ai-bubble { opacity: 0; animation: ai-ai-speech 20s steps(1,end) 20s infinite; }
@keyframes phone-screen-light { 50% { opacity: .85; } }
@keyframes phone-scroll { 45%,65% { transform: translateY(-1px); } }
@keyframes ai-ai-speech { 0%,14% { opacity: 1; } 15%,100% { opacity: 0; } }
@media(prefers-reduced-motion:reduce) {
  .phone-screen,.phone-thumb,.ai-ai-bubble { animation: none; }
  .ai-ai-bubble { opacity: 1; }
}
'''

for animated in [False, True]:
    source = 'science-lab-animated.svg' if animated else 'science-lab.svg'
    scene = ET.parse(ASSETS / source).getroot()
    # Move the five existing pieces of the left stool beneath the researcher.
    stool_parts = {(73, 150, 26, 3), (71, 153, 30, 4), (76, 157, 3, 20),
                   (93, 157, 3, 20), (78, 168, 17, 2)}
    moved = 0
    for item in scene.iter(NS + 'rect'):
        geometry = tuple(float(item.get(key, 0)) for key in ('x', 'y', 'width', 'height'))
        if geometry in stool_parts:
            item.set('x', str(int(geometry[0]) - 40))
            moved += 1
    assert moved == 5, 'Expected the five original left-stool pieces'

    ET.SubElement(scene, NS + 'title').text = 'Laboratório do LSN com pesquisador sentado usando o celular'
    ET.SubElement(scene, NS + 'desc').text = 'Cena em pixel art com notebooks, quadro de física, um cientista preparando café e um pesquisador cacheado, de barba e óculos redondos, sentado usando o celular. Seu balão diz AI AI.'
    if animated:
        ET.SubElement(scene, NS + 'style').text = animation
    scene.append(deepcopy(character))
    scene.append(deepcopy(bubble))
    filename = 'science-lab-animated-2.svg' if animated else 'science-lab-2.svg'
    (ASSETS / filename).write_text(ET.tostring(scene, encoding='unicode') + '\n', encoding='utf-8', newline='\n')
