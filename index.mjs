// In-memory file store (persists while the worker instance is warm).
const FILES = new Map(); // id -> { id, name, type, size, uploaded, data(ArrayBuffer) }

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Storage Hub</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0e1116; --panel: #171b22; --panel2: #1f242d; --line: #2a313c;
    --txt: #e6edf3; --muted: #8b97a7; --accent: #4f8cff; --accent2: #7c5cff;
    --good: #2ec27e; --danger: #ff5d5d;
  }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: radial-gradient(1200px 600px at 80% -10%, #1b2330 0%, var(--bg) 60%);
    color: var(--txt); min-height: 100vh; padding: 28px 18px; }
  .wrap { max-width: 880px; margin: 0 auto; }
  header { display: flex; align-items: center; gap: 14px; margin-bottom: 26px; }
  .logo { width: 46px; height: 46px; border-radius: 12px;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    display: grid; place-items: center; font-size: 24px; box-shadow: 0 6px 20px rgba(79,140,255,.35); }
  h1 { font-size: 22px; letter-spacing: .3px; }
  header p { color: var(--muted); font-size: 13px; margin-top: 2px; }
  .drop { border: 2px dashed var(--line); border-radius: 16px; background: var(--panel);
    padding: 40px 20px; text-align: center; cursor: pointer; transition: .2s; position: relative; display: block; }
  .drop:hover, .drop.over { border-color: var(--accent); background: var(--panel2);
    box-shadow: 0 0 0 4px rgba(79,140,255,.1); }
  .drop .big { font-size: 40px; margin-bottom: 8px; }
  .drop strong { color: var(--accent); }
  .drop small { display: block; color: var(--muted); margin-top: 8px; font-size: 12px; }
  #file { display: none; }
  .bar { height: 6px; border-radius: 4px; background: var(--panel2); overflow: hidden;
    margin-top: 16px; display: none; }
  .bar.show { display: block; }
  .bar i { display: block; height: 100%; width: 0;
    background: linear-gradient(90deg, var(--accent), var(--accent2)); transition: width .2s; }
  .section-head { display: flex; align-items: center; justify-content: space-between;
    margin: 28px 4px 12px; }
  .section-head h2 { font-size: 15px; color: var(--muted); font-weight: 600;
    text-transform: uppercase; letter-spacing: 1px; }
  .count { font-size: 12px; color: var(--muted); }
  .list { display: flex; flex-direction: column; gap: 10px; }
  .item { display: flex; align-items: center; gap: 14px; background: var(--panel);
    border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; transition: .15s; }
  .item:hover { border-color: var(--accent); transform: translateY(-1px); }
  .ic { width: 42px; height: 42px; border-radius: 10px; background: var(--panel2);
    display: grid; place-items: center; font-size: 20px; flex-shrink: 0; }
  .meta { flex: 1; min-width: 0; }
  .meta .nm { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta .sub { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .acts { display: flex; gap: 8px; }
  .btn { border: none; cursor: pointer; font-size: 13px; padding: 8px 12px; border-radius: 8px;
    text-decoration: none; display: inline-flex; align-items: center; gap: 5px; transition: .15s; }
  .dl { background: var(--accent); color: #fff; }
  .dl:hover { filter: brightness(1.1); }
  .del { background: transparent; color: var(--danger); border: 1px solid var(--line); }
  .del:hover { background: rgba(255,93,93,.12); border-color: var(--danger); }
  .empty { text-align: center; color: var(--muted); padding: 40px; font-size: 14px;
    border: 1px dashed var(--line); border-radius: 12px; }
  .note { margin-top: 26px; font-size: 12px; color: var(--muted); text-align: center; line-height: 1.6; }
  .toast { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%) translateY(120%);
    background: var(--panel2); border: 1px solid var(--line); padding: 12px 20px;
    border-radius: 10px; font-size: 14px; transition: .3s; box-shadow: 0 8px 30px rgba(0,0,0,.4); }
  .toast.show { transform: translateX(-50%) translateY(0); }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="logo">📦</div>
    <div>
      <h1>Storage Hub</h1>
      <p>Upload &amp; retrieve files of any type</p>
    </div>
  </header>

  <label class="drop" id="drop" for="file">
    <div class="big">⬆️</div>
    <div>Drop files here or <strong>click to browse</strong></div>
    <small>Any file type · multiple files supported</small>
    <input type="file" id="file" multiple>
    <div class="bar" id="bar"><i id="barFill"></i></div>
  </label>

  <div class="section-head">
    <h2>Your Files</h2>
    <span class="count" id="count"></span>
  </div>
  <div class="list" id="list"></div>

  <p class="note">
    ⚠️ Files are stored in the worker's memory and may be cleared when the instance
    recycles. Use this as a temporary hub, not permanent backup.
  </p>
</div>
<div class="toast" id="toast"></div>

<script>
(function () {
  var drop = document.getElementById('drop');
  var fileInput = document.getElementById('file');
  var listEl = document.getElementById('list');
  var countEl = document.getElementById('count');
  var bar = document.getElementById('bar');
  var barFill = document.getElementById('barFill');
  var toastEl = document.getElementById('toast');

  function iconFor(name, type) {
    var e = (name.split('.').pop() || '').toLowerCase();
    type = type || '';
    if (type.indexOf('image/') === 0 || ['png','jpg','jpeg','gif','webp','svg','bmp'].indexOf(e) >= 0) return '🖼️';
    if (type.indexOf('video/') === 0 || ['mp4','mov','webm','avi','mkv'].indexOf(e) >= 0) return '🎬';
    if (type.indexOf('audio/') === 0 || ['mp3','wav','ogg','flac','m4a'].indexOf(e) >= 0) return '🎵';
    if (e === 'pdf') return '📕';
    if (['zip','rar','7z','tar','gz'].indexOf(e) >= 0) return '🗜️';
    if (['js','ts','py','java','c','cpp','html','css','json','go','rs','rb','php','sh'].indexOf(e) >= 0) return '💻';
    if (['doc','docx'].indexOf(e) >= 0) return '📘';
    if (['xls','xlsx','csv'].indexOf(e) >= 0) return '📗';
    if (type.indexOf('text/') === 0 || ['txt','md'].indexOf(e) >= 0) return '📄';
    return '📁';
  }
  function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }
  function fmtDate(t) { return new Date(t).toLocaleString(); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }

  function load() {
    fetch('/api/files').then(function (r) { return r.json(); }).then(function (files) {
      countEl.textContent = files.length + (files.length === 1 ? ' file' : ' files');
      if (!files.length) {
        listEl.innerHTML = '<div class="empty">No files yet — upload something above ☝️</div>';
        return;
      }
      var html = '';
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        html +=
          '<div class="item">' +
            '<div class="ic">' + iconFor(f.name, f.type) + '</div>' +
            '<div class="meta">' +
              '<div class="nm" title="' + esc(f.name) + '">' + esc(f.name) + '</div>' +
              '<div class="sub">' + fmtSize(f.size) + ' · ' + fmtDate(f.uploaded) + '</div>' +
            '</div>' +
            '<div class="acts">' +
              '<a class="btn dl" href="/api/file/' + f.id + '?dl=1">Download</a>' +
              '<button class="btn del" data-id="' + f.id + '">Delete</button>' +
            '</div>' +
          '</div>';
      }
      listEl.innerHTML = html;
      var dels = listEl.querySelectorAll('.del');
      for (var j = 0; j < dels.length; j++) {
        dels[j].onclick = (function (id) { return function () { del(id); }; })(dels[j].getAttribute('data-id'));
      }
    });
  }

  function del(id) {
    fetch('/api/file/' + id, { method: 'DELETE' }).then(function () {
      toast('File deleted');
      load();
    });
  }

  function uploadFiles(files) {
    if (!files.length) return;
    bar.classList.add('show');
    var done = 0;
    var total = files.length;
    function next(i) {
      if (i >= total) {
        setTimeout(function () { bar.classList.remove('show'); barFill.style.width = '0'; }, 400);
        toast(total + ' file' + (total > 1 ? 's' : '') + ' uploaded');
        load();
        return;
      }
      var f = files[i];
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload');
      xhr.setRequestHeader('x-filename', encodeURIComponent(f.name));
      xhr.setRequestHeader('content-type', f.type || 'application/octet-stream');
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) {
          var pct = ((done + e.loaded / e.total) / total) * 100;
          barFill.style.width = pct + '%';
        }
      };
      xhr.onload = function () { done++; barFill.style.width = (done / total * 100) + '%'; next(i + 1); };
      xhr.onerror = function () { toast('Upload failed'); next(i + 1); };
      xhr.send(f);
    }
    next(0);
  }

  fileInput.onchange = function () { uploadFiles([].slice.call(fileInput.files)); fileInput.value = ''; };
  ['dragenter', 'dragover'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
  });
  ['dragleave'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
  });
  drop.addEventListener('drop', function (e) {
    e.preventDefault();
    drop.classList.remove('over');
    uploadFiles([].slice.call(e.dataTransfer.files));
  });

  load();
})();
</script>
</body>
</html>`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // List files
    if (path === "/api/files") {
      const arr = [...FILES.values()].map((f) => ({
        id: f.id, name: f.name, type: f.type, size: f.size, uploaded: f.uploaded,
      })).sort((a, b) => b.uploaded - a.uploaded);
      return Response.json(arr);
    }

    // Upload
    if (path === "/api/upload" && request.method === "POST") {
      const name = decodeURIComponent(request.headers.get("x-filename") || "untitled");
      const type = request.headers.get("content-type") || "application/octet-stream";
      const data = await request.arrayBuffer();
      const id = uid();
      FILES.set(id, { id, name, type, size: data.byteLength, uploaded: Date.now(), data });
      return Response.json({ ok: true, id });
    }

    // Retrieve / download / delete a single file
    const m = path.match(/^\/api\/file\/([a-z0-9]+)$/i);
    if (m) {
      const id = m[1];
      if (request.method === "DELETE") {
        FILES.delete(id);
        return Response.json({ ok: true });
      }
      const f = FILES.get(id);
      if (!f) return new Response("Not found", { status: 404 });
      const dl = url.searchParams.get("dl");
      const headers = {
        "content-type": f.type,
        "content-length": String(f.size),
        "content-disposition": `${dl ? "attachment" : "inline"}; filename="${f.name.replace(/"/g, "")}"`,
      };
      return new Response(f.data, { headers });
    }

    if (path === "/" || path === "/index.html") {
      return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    return new Response("Not found", { status: 404 });
  },
};