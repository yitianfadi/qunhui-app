"""把 uvue 样式里的硬编码颜色换成 CSS 变量（深色模式用）。一次性脚本，可重复运行。"""
import re
import sys
import os

BG = {
    '#ffffff': '--card', '#fff': '--card',
    '#f7f8fa': '--bg', '#f5f6f8': '--card2', '#f2f4f7': '--card2',
    '#f5f7fa': '--bg', '#f4f6f8': '--bg', '#fafafa': '--bg',
    '#f0f2f5': '--card2', '#f0f0f0': '--line',
    '#eef1f5': '--line', '#eef0f3': '--line', '#eeeeee': '--line',
    '#e4ebf3': '--line', '#eef2f7': '--line',
    '#e8eef5': '--soft', '#eaf2fb': '--soft', '#e9f1fa': '--soft',
    '#e8f1fb': '--brand-weak', '#e6f0fa': '--brand-weak',
    '#fdeceb': '--danger-weak', '#fff7e6': '--warn-weak', '#e8f6ee': '--ok-weak',
    '#1e6bb8': '--brand', '#d94838': '--danger',
}

FG = {
    '#222222': '--t1', '#222': '--t1', '#1f2328': '--t1', '#1a1d21': '--t1',
    '#000000': '--t1', '#000': '--t1', '#111111': '--t1',
    '#4b5563': '--t2', '#666666': '--t2', '#666': '--t2', '#333333': '--t2',
    '#444444': '--t2', '#555555': '--t2', '#555': '--t2',
    '#8a8f99': '--t3', '#999999': '--t3', '#9aa0a8': '--t3', '#6b7280': '--t3',
    '#888888': '--t3', '#cccccc': '--t3', '#c8ccd4': '--t3', '#b0b5bd': '--t3',
    '#7a808a': '--t3',
    '#1e6bb8': '--brand', '#d94838': '--danger',
    '#8a5a00': '--warn', '#1a9c5b': '--ok',
}

BORDER = {
    '#eef1f5': '--line', '#eef0f3': '--line', '#eeeeee': '--line', '#f0f0f0': '--line',
    '#e4ebf3': '--line', '#eef2f7': '--line', '#e8eef5': '--line',
    '#e0e0e0': '--line2', '#c4c9d1': '--line2', '#d5d9e0': '--line2', '#a9c4de': '--line2',
    '#1e6bb8': '--brand',
}

HEX = r'(#[0-9a-fA-F]{3,6})'
BRAND_BG = re.compile(r'background-color:\s*(var\(--brand\)|var\(--danger\)|#1e6bb8|#d94838)')


def transform_rule(name, body):
    brand_bg = BRAND_BG.search(body) is not None
    dark_overlay = ('viewer' in name) or ('zoom' in name)

    def rep_bg(m):
        v = m.group(1).lower()
        if v in BG:
            return 'background-color: var(' + BG[v] + ')'
        return m.group(0)

    out = re.sub(r'background-color:\s*' + HEX, rep_bg, body)

    def rep_fg(m):
        v = m.group(1).lower()
        if v in ('#ffffff', '#fff'):
            if dark_overlay:
                return m.group(0)
            if brand_bg:
                return 'color: var(--on-brand)'
            return 'color: var(--t1)'
        if v in FG:
            return 'color: var(' + FG[v] + ')'
        return m.group(0)

    # 排除 background-color 里的 color:
    out = re.sub(r'(?<![a-zA-Z-])color:\s*' + HEX, rep_fg, out)

    def rep_bd(m):
        v = m.group(1).lower()
        if v in BORDER:
            return m.group(0).replace(m.group(1), 'var(' + BORDER[v] + ')')
        return m.group(0)

    out = re.sub(r'border(?:-[a-z]+)?:\s*[^;{}]*?' + HEX, rep_bd, out)
    out = re.sub(r'border(?:-[a-z]+)?-color:\s*' + HEX, rep_bd, out)
    return out


def process(path, dry=False):
    s = open(path, encoding='utf-8').read()
    m = re.search(r'<style>(.*?)</style>', s, re.S)
    if not m:
        print('  no style block:', path)
        return 0
    style = m.group(1)
    changed = [0]
    samples = []

    def rule(mo):
        name, body = mo.group(1), mo.group(2)
        nb = transform_rule(name, body)
        if nb != body:
            changed[0] += 1
            if dry and len(samples) < 3:
                samples.append((name, body.strip().replace('\n', ' ')[:110], nb.strip().replace('\n', ' ')[:110]))
        return '.' + name + ' {' + nb + '}'

    new_style = re.sub(r'\.([a-zA-Z0-9_-]+)\s*\{([^}]*)\}', rule, style)
    if dry:
        for n, b, nb in samples:
            print('   .%s\n     before: %s\n     after : %s' % (n, b, nb))
    if new_style != style and not dry:
        s = s[:m.start(1)] + new_style + s[m.end(1):]
        open(path, 'w', encoding='utf-8').write(s)
    print('  %-52s changed rules: %d' % (os.path.basename(path), changed[0]))
    return changed[0]


if __name__ == '__main__':
    dry = '--dry' in sys.argv
    for p in [a for a in sys.argv[1:] if not a.startswith('--')]:
        print(p)
        process(p, dry)
