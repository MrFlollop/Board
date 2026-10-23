#!/usr/bin/env python3
"""Concatenates src/ into one deployable index.html"""
import pathlib
root = pathlib.Path(__file__).parent
css = (root/'src/style.css').read_text()
js = ''.join((root/'src'/f).read_text()+'\n' for f in ['core.js','views.js','panels.js'])
fav = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%9F%A2%3C/text%3E%3C/svg%3E"
html = f'''<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>BOARD (alpha)</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#111111">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="BOARD">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="{fav}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css">
<style>
{css}
</style>
</head>
<body>
<div id="app"><div class="skeleton">Loading BOARD</div></div>
<script>
(function () {{
'use strict';
{js}
boot();
}})();
</script>
</body>
</html>
'''
(root/'index.html').write_text(html)
print('index.html', len(html)//1024, 'KB')
