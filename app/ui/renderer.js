const $ = id => document.getElementById(id);
let photos = [], selected = null, mode = 'watermark', original = false, busy = false, loading = false;
let ticket = 0, previewData = null, page = 0;
const results = new Map();
function showOutput(value) { const pieces = value.split(/[\\/]/).filter(Boolean); $('output-path').textContent = pieces.length ? pieces.slice(-2).join(' / ') : 'next to your photos / matted'; $('output').title = value || 'choose output folder'; $('open-output').disabled = !value; }
function notice(message) { $('message-text').textContent = message; $('message').hidden = !message; }
function lock() {
  for (const id of ['add','folder','empty-add','output','clear','remove']) $(id).disabled = busy || loading || (['clear','remove'].includes(id) && !photos.length);
  document.querySelectorAll('input[name=mode]').forEach(input => input.disabled = busy || loading);
  $('export').disabled = busy || loading || !photos.length;
  $('original').disabled = $('framed').disabled = busy || !photos.length;
  $('cancel').hidden = !busy;
  $('export').textContent = busy ? 'exporting…' : `export ${photos.length || ''} photo${photos.length === 1 ? '' : 's'}`;
}
function updateState(state) {
  photos = state.photos;
  if (!photos.some(photo => photo.id === selected)) selected = photos[0]?.id || null;
  showOutput(state.outputDir);
  $('count').textContent = `${photos.length} photo${photos.length === 1 ? '' : 's'}`;
  $('status').textContent = photos.length ? `ready · ${photos.length} photos selected` : 'ready · add photos to get started';
  drawQueue(); lock();
}
function drawQueue() {
  $('queue').replaceChildren();
  for (const photo of photos) {
    const button = document.createElement('button');
    button.className = `thumb ${photo.id === selected ? 'selected' : ''} ${results.get(photo.id) || ''}`;
    button.title = photo.name; button.setAttribute('aria-label', `preview ${photo.name}`);
    const img = document.createElement('img'); img.src = photo.thumbnail; img.alt = '';
    const name = document.createElement('span'); name.textContent = photo.name;
    button.append(img, name);
    button.addEventListener('click', () => { if (!busy && !loading) { selected = photo.id; drawQueue(); refreshPreview(); } });
    $('queue').append(button);
  }
}
function displayPage() {
  const current = previewData?.images[page];
  if (!current) return;
  $('preview').src = current.url;
  $('image-wrap').hidden = false;
  const description = previewData.mode === 'original' ? 'original' : previewData.mode === 'panorama' ? (page === previewData.images.length - 1 ? 'full image' : `slice ${page + 1}`) : 'framed';
  $('caption').textContent = `${current.width} × ${current.height} · jpeg · ${description}`;
  $('pages').replaceChildren();
  $('pages').hidden = previewData.images.length < 2;
  previewData.images.forEach((image, index) => {
    const button = document.createElement('button'); button.textContent = index === previewData.images.length - 1 ? 'full image' : `slice ${index + 1}`;
    button.className = page === index ? 'active' : '';
    button.addEventListener('click', () => { page = index; displayPage(); }); $('pages').append(button);
  });
}
async function refreshPreview() {
  const request = ++ticket;
  const photo = photos.find(item => item.id === selected);
  $('filename').textContent = photo?.name || '';
  for (const field of ['camera','lens','exposure']) $(field).textContent = photo ? photo[field] || 'not available' : '—';
  $('warning').textContent = photo?.warning || ''; $('warning').hidden = !photo?.warning;
  $('empty').hidden = Boolean(photo); $('image-wrap').hidden = true; $('pages').hidden = true;
  $('output-name').textContent = photo ? `${photo.name.replace(/\.jpe?g$/i,'')}-framed${mode === 'panorama' || (mode === 'smart' && photo.width/photo.height > 2) ? '-1' : ''}.jpg` : 'photo-framed.jpg';
  if (!photo) { $('loading').hidden = true; $('caption').textContent = 'jpeg photos · processed on this computer'; return; }
  $('loading').hidden = false;
  try {
    const data = await window.fsc.preview(photo.id, mode, original);
    if (request !== ticket) return;
    previewData = data; page = data.mode === 'panorama' ? data.images.length - 1 : 0; displayPage();
  } catch (error) { if (request === ticket) { notice(error.message); $('caption').textContent = 'preview unavailable'; } }
  finally { if (request === ticket) $('loading').hidden = true; }
}
async function ingest(action) {
  if (busy || loading) return;
  loading = true; lock(); $('status').textContent = 'reading photos…';
  try { const state = await action(); updateState(state); if (state.errors?.length) notice(state.errors.join('\n')); else if (!state.photos.length) notice('no jpeg photos found; folder selection reads only the files directly inside it'); await refreshPreview(); }
  catch (error) { notice(error.message); }
  finally { loading = false; lock(); }
}
$('add').onclick = $('empty-add').onclick = () => ingest(() => window.fsc.choose('photos'));
$('folder').onclick = () => ingest(() => window.fsc.choose('folder'));
$('clear').onclick = () => ingest(() => window.fsc.clear());
$('remove').onclick = () => ingest(() => window.fsc.remove(selected));
$('dismiss').onclick = () => notice('');
$('output').onclick = async () => { try { showOutput(await window.fsc.output()); } catch (error) { notice(error.message); } };
$('open-output').onclick = async () => { try { await window.fsc.openOutput(); } catch (error) { notice(error.message); } };
for (const input of document.querySelectorAll('input[name=mode]')) input.onchange = () => { mode = input.value; refreshPreview(); };
for (const [id, value] of [['original',true],['framed',false]]) $(id).onclick = () => {
  original = value; $('original').classList.toggle('active', value); $('framed').classList.toggle('active', !value);
  $('original').setAttribute('aria-pressed', String(value)); $('framed').setAttribute('aria-pressed', String(!value)); refreshPreview();
};
$('export').onclick = async () => {
  busy = true; ++ticket; $('loading').hidden = true; lock(); notice(''); results.clear(); drawQueue(); $('progress').hidden = false; $('progress').value = 0;
  try {
    const report = await window.fsc.export(mode);
    const good = report.results.filter(item => !item.error), bad = report.results.filter(item => item.error);
    const count = good.reduce((sum, item) => sum + item.paths.length, 0);
    $('status').textContent = `${report.cancelled ? 'stopped' : 'done'} · ${good.length} photos · ${count} files exported${bad.length ? ` · ${bad.length} failed` : ''}`;
    if (bad.length) notice(bad.map(item => `${item.name}: ${item.error}`).join('\n'));
    else if (count) notice(`${count} files saved. existing files were kept; repeated names receive a numbered suffix.`);
  } catch (error) { notice(error.message); $('status').textContent = 'export failed'; }
  finally { busy = false; lock(); $('progress').hidden = true; }
};
$('cancel').onclick = async () => { await window.fsc.cancel(); $('status').textContent = 'stopping after the current photo…'; };
window.fsc.onProgress(data => {
  $('progress').max = data.total; $('progress').value = data.index;
  $('status').textContent = data.phase === 'working' ? `exporting ${data.index + 1} of ${data.total} · ${data.name}` : `exported ${data.index} of ${data.total}`;
  if (data.result) { results.set(data.id, data.result.error ? 'failed' : 'success'); drawQueue(); }
});
window.fsc.onNotice(notice);
document.addEventListener('dragover', event => { event.preventDefault(); if (!busy && !loading) $('stage').classList.add('dragging'); });
document.addEventListener('dragleave', event => { if (!event.relatedTarget) $('stage').classList.remove('dragging'); });
document.addEventListener('drop', event => { event.preventDefault(); $('stage').classList.remove('dragging'); const files = [...event.dataTransfer.files]; if (files.length) ingest(() => window.fsc.drop(files)); });
window.fsc.state().then(async state => { updateState(state); await refreshPreview(); }).catch(error => notice(error.message));
