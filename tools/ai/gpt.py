# Small OpenAI helper for art work (review pictures, make / enhance images). The key is read from the environment
# variable OPENAI_API_KEY (or, on Windows, the user's saved environment in the registry) and never printed or stored.
#   python tools/ai/gpt.py review <prompt.txt> <out.md> <image> [image…]        ask gpt-6.2-astra about pictures
#   python tools/ai/gpt.py edit <prompt.txt> <out.png> <image> [mask.png]       repaint / enhance one picture
#   python tools/ai/gpt.py make <prompt.txt> <out.png> [WxH]                    a new picture
import sys, os, json, base64, mimetypes, urllib.request, uuid

CHAT_MODEL = 'gpt-6.2-astra'
IMAGE_MODEL = 'gpt-image-2.6-sunburst'

def key():
    k = os.environ.get('OPENAI_API_KEY')
    if not k and os.name == 'nt':
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, 'Environment') as h:
            k = winreg.QueryValueEx(h, 'OPENAI_API_KEY')[0]
    if not k: sys.exit('OPENAI_API_KEY is not set')
    return k

def post_json(path, body, timeout=600):
    req = urllib.request.Request('https://api.openai.com' + path, data=json.dumps(body).encode(), method='POST',
                                 headers={'Authorization': 'Bearer ' + key(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r: return json.load(r)
    except urllib.error.HTTPError as e: sys.exit(f'HTTP {e.code}: {e.read().decode()[:600]}')

def post_form(path, fields, files, timeout=900):
    b = uuid.uuid4().hex; parts = []
    for k, v in fields.items(): parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    for k, p in files:
        parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{k}"; filename="{os.path.basename(p)}"\r\nContent-Type: {mimetypes.guess_type(p)[0] or "image/png"}\r\n\r\n'.encode() + open(p, 'rb').read() + b'\r\n')
    parts.append(f'--{b}--\r\n'.encode())
    req = urllib.request.Request('https://api.openai.com' + path, data=b''.join(parts), method='POST',
                                 headers={'Authorization': 'Bearer ' + key(), 'Content-Type': f'multipart/form-data; boundary={b}'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r: return json.load(r)
    except urllib.error.HTTPError as e: sys.exit(f'HTTP {e.code}: {e.read().decode()[:600]}')

def data_url(p): return f'data:{mimetypes.guess_type(p)[0] or "image/png"};base64,' + base64.b64encode(open(p, 'rb').read()).decode()

def review(prompt, images):
    content = [{'type': 'input_text', 'text': prompt}] + [{'type': 'input_image', 'image_url': data_url(p)} for p in images]
    r = post_json('/v1/responses', {'model': CHAT_MODEL, 'input': [{'role': 'user', 'content': content}]})
    out = []
    for item in r.get('output', []):
        for c in item.get('content', []) or []:
            if c.get('type') in ('output_text', 'text'): out.append(c.get('text', ''))
    return '\n'.join(out), r.get('usage', {})

def save_image(r, out):
    d = r['data'][0]
    open(out, 'wb').write(base64.b64decode(d['b64_json']))
    return r.get('usage', {})

if __name__ == '__main__':
    cmd, prompt_file, out = sys.argv[1:4]
    prompt = open(prompt_file, encoding='utf-8').read()
    if cmd == 'review':
        text, usage = review(prompt, sys.argv[4:])
        open(out, 'w', encoding='utf-8').write(text); print('review written', out, usage)
    elif cmd == 'edit':
        img = sys.argv[4]; files = [('image', img)] + ([('mask', sys.argv[5])] if len(sys.argv) > 5 else [])
        usage = save_image(post_form('/v1/images/edits', {'model': IMAGE_MODEL, 'prompt': prompt, 'quality': 'high', 'size': 'auto'}, files), out)
        print('image written', out, usage)
    elif cmd == 'make':
        size = sys.argv[4] if len(sys.argv) > 4 else '1024x1024'
        usage = save_image(post_json('/v1/images/generations', {'model': IMAGE_MODEL, 'prompt': prompt, 'quality': 'high', 'size': size}), out)
        print('image written', out, usage)
