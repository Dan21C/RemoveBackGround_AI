/* ─── ELEMENTS ────────────────────────────────────────────────────── */
const form          = document.querySelector('#convertForm');
const videoInput    = document.querySelector('#videoInput');
const dropzone      = document.querySelector('#dropzone');
const fileChip      = document.querySelector('#fileChip');
const fileName      = document.querySelector('#fileName');
const fileMeta      = document.querySelector('#fileMeta');
const removeFileBtn = document.querySelector('#removeFile');
const submitBtn     = document.querySelector('#submitBtn');

const stateIdle     = document.querySelector('#stateIdle');
const stateActive   = document.querySelector('#stateActive');
const statusTitle   = document.querySelector('#statusTitle');
const statusText    = document.querySelector('#statusText');
const loader        = document.querySelector('#loader');
const doneBadge     = document.querySelector('#doneBadge');
const errorBadge    = document.querySelector('#errorBadge');
const progressWrap  = document.querySelector('#progressWrap');
const progressFill  = document.querySelector('#progressFill');
const progressLabel = document.querySelector('#progressLabel');

const result          = document.querySelector('#result');
const previewVideo    = document.querySelector('#previewVideo');
const downloadLink    = document.querySelector('#downloadLink');
const embedCode       = document.querySelector('#embedCode');
const copyEmbedBtn    = document.querySelector('#copyEmbedBtn');
const convertAnother  = document.querySelector('#convertAnotherBtn');
const toast           = document.querySelector('#toast');

const crf       = document.querySelector('#crf');
const crfValue  = document.querySelector('#crfValue');
const mode      = document.querySelector('#mode');
const model     = document.querySelector('#model');
const modelField = document.querySelector('#modelField');

const steps = [1, 2, 3, 4].map(n => document.querySelector(`#step${n}`));
const lines = ['line12','line23','line34'].map(id => document.querySelector(`#${id}`));

/* ─── STEPPER ─────────────────────────────────────────────────────── */
function setStep(active) {
  steps.forEach((el, i) => {
    el.classList.toggle('complete', i + 1 < active);
    el.classList.toggle('active',   i + 1 === active);
  });
  lines.forEach((line, i) => {
    line.classList.toggle('done', i + 1 < active);
  });
}

setStep(1);

/* ─── CRF SLIDER ──────────────────────────────────────────────────── */
function updateCrfTrack() {
  const pct = (crf.value / 51 * 100).toFixed(1) + '%';
  crf.style.setProperty('--pct', pct);
  crfValue.textContent = crf.value;
}

crf.addEventListener('input', updateCrfTrack);
updateCrfTrack();

/* ─── MODE ────────────────────────────────────────────────────────── */
mode.addEventListener('change', () => {
  const isPreserve = mode.value === 'preserve_alpha';
  model.disabled = isPreserve;
  modelField.style.opacity = isPreserve ? '.45' : '1';
});

/* ─── DROPZONE DRAG ───────────────────────────────────────────────── */
['dragenter', 'dragover'].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add('is-dragging'); })
);
['dragleave', 'drop'].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove('is-dragging'); })
);

dropzone.addEventListener('drop', e => {
  const file = e.dataTransfer.files?.[0];
  if (!file) return;
  const dt = new DataTransfer();
  dt.items.add(file);
  videoInput.files = dt.files;
  applyFile(file);
});

/* ─── FILE SELECTION ──────────────────────────────────────────────── */
videoInput.addEventListener('change', () => {
  const file = videoInput.files?.[0];
  if (file) applyFile(file);
});

async function applyFile(file) {
  fileName.textContent = file.name;
  fileMeta.textContent = formatSize(file.size);

  fileChip.hidden = false;
  submitBtn.disabled = false;
  setStep(2);

  try {
    const meta = await getVideoMeta(file);
    const parts = [file.name.split('.').pop().toUpperCase(), formatSize(file.size)];
    if (meta.duration) parts.push(formatDuration(meta.duration));
    if (meta.width)    parts.push(`${meta.width}×${meta.height}`);
    fileMeta.textContent = parts.join(' · ');
  } catch {}
}

function formatSize(bytes) {
  return (bytes / 1e6).toFixed(1) + ' MB';
}

function formatDuration(s) {
  const m = Math.floor(s / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  return `${m}:${sec}`;
}

function getVideoMeta(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.onloadedmetadata = () => { resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight }); URL.revokeObjectURL(url); };
    v.onerror = reject;
    v.src = url;
  });
}

/* ─── REMOVE FILE ─────────────────────────────────────────────────── */
removeFileBtn.addEventListener('click', () => {
  videoInput.value = '';
  fileChip.hidden = true;
  submitBtn.disabled = true;
  setStep(1);
  result.hidden = true;
  resetStatusCard();
});

function resetStatusCard() {
  stateIdle.hidden = false;
  stateActive.hidden = true;
  progressWrap.hidden = true;
  progressFill.style.width = '0%';
}

/* ─── STATUS ──────────────────────────────────────────────────────── */
function setStatus({ title, text, isError = false, loading = true, pct = null }) {
  stateIdle.hidden = true;
  stateActive.hidden = false;

  statusTitle.textContent = title;
  statusText.textContent  = text;
  statusText.classList.toggle('error', isError);

  loader.hidden     = !loading || isError;
  doneBadge.hidden  = loading  || isError || pct !== 100;
  errorBadge.hidden = !isError;

  if (pct !== null) {
    progressWrap.hidden = false;
    progressFill.style.width = `${pct}%`;
    progressLabel.textContent = `${pct}%`;
  }
}

/* ─── CODE SNIPPET ────────────────────────────────────────────────── */
function renderEmbed(filename) {
  embedCode.dataset.plain = `<video autoplay muted loop playsinline>\n  <source src="${filename}" type="video/webm">\n</video>`;
  embedCode.innerHTML = [
    `<span class="line"><span class="ln">1</span><span class="hl-tag">&lt;video</span> <span class="hl-attr">autoplay</span> <span class="hl-attr">muted</span> <span class="hl-attr">loop</span> <span class="hl-attr">playsinline</span><span class="hl-tag">&gt;</span></span>`,
    `<span class="line"><span class="ln">2</span>  <span class="hl-tag">&lt;source</span> <span class="hl-attr">src</span>=<span class="hl-val">"${filename}"</span> <span class="hl-attr">type</span>=<span class="hl-val">"video/webm"</span><span class="hl-tag">&gt;</span></span>`,
    `<span class="line"><span class="ln">3</span><span class="hl-tag">&lt;/video&gt;</span></span>`,
  ].join('\n');
}

/* ─── SHOW RESULT ─────────────────────────────────────────────────── */
function showResult(payload) {
  previewVideo.src = payload.preview_url;
  downloadLink.href = payload.download_url;
  downloadLink.setAttribute('download', payload.filename);
  renderEmbed(payload.filename);

  setStatus({ title: 'Conversión finalizada', text: 'Ya puedes previsualizar y descargar el WebM transparente.', loading: false, pct: 100 });
  result.hidden = false;
  setStep(4);
}

/* ─── COPY EMBED ──────────────────────────────────────────────────── */
copyEmbedBtn.addEventListener('click', () => {
  const text = embedCode.dataset.plain || embedCode.textContent;
  navigator.clipboard.writeText(text).then(showToast).catch(() => {});
});

let toastTimer;
function showToast() {
  clearTimeout(toastTimer);
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2400);
}

/* ─── CONVERT ANOTHER ─────────────────────────────────────────────── */
convertAnother.addEventListener('click', () => {
  videoInput.value = '';
  fileChip.hidden = true;
  submitBtn.disabled = true;
  result.hidden = true;
  resetStatusCard();
  setStep(1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ─── FORM SUBMIT (XHR + SSE) ─────────────────────────────────────── */
form.addEventListener('submit', e => {
  e.preventDefault();

  const file = videoInput.files?.[0];
  if (!file) {
    setStatus({ title: 'Falta el video', text: 'Selecciona un archivo .mov, .mp4 o .webm.', isError: true, loading: false });
    return;
  }

  result.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Procesando…';
  setStep(3);
  setStatus({ title: 'Subiendo video…', text: file.name, pct: 0 });

  const xhr = new XMLHttpRequest();

  xhr.upload.addEventListener('progress', e => {
    if (!e.lengthComputable) return;
    const pct = Math.round(e.loaded / e.total * 100);
    setStatus({
      title: 'Subiendo video…',
      text: `${file.name} — ${formatSize(e.loaded)} / ${formatSize(e.total)}`,
      pct,
    });
  });

  xhr.addEventListener('load', () => {
    let payload;
    try { payload = JSON.parse(xhr.responseText); } catch {
      onError('Respuesta inválida del servidor.');
      return;
    }
    if (!payload.ok) { onError(payload.error || 'Error desconocido.'); return; }

    setStatus({ title: 'Iniciando conversión…', text: 'El servidor está procesando el video.', pct: 0 });
    watchProgress(payload.job_id);
  });

  xhr.addEventListener('error', () => onError('No se pudo conectar con el servidor.'));

  xhr.open('POST', '/api/convert');
  xhr.send(new FormData(form));
});

function watchProgress(jobId) {
  const sse = new EventSource(`/api/progress/${jobId}`);

  sse.onmessage = e => {
    const job = JSON.parse(e.data);

    if (job.error) {
      sse.close();
      onError(job.error);
      return;
    }

    setStatus({ title: job.stage, text: 'Esto puede tardar varios minutos según el tamaño del archivo.', pct: job.pct });

    if (job.done && job.result) {
      sse.close();
      showResult(job.result);
      resetSubmit();
    }
  };

  sse.onerror = () => {
    sse.close();
    onError('Se perdió la conexión con el servidor.');
  };
}

function onError(msg) {
  setStatus({ title: 'Error en la conversión', text: msg, isError: true, loading: false });
  resetSubmit();
  setStep(2);
}

function resetSubmit() {
  submitBtn.disabled = false;
  submitBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg> Convertir a WebM`;
}

/* ─── HEALTH CHECK ────────────────────────────────────────────────── */
fetch('/api/health')
  .then(r => r.json())
  .then(payload => {
    if (!payload.ffmpeg) {
      setStatus({
        title: 'FFmpeg no está instalado',
        text: 'Instala FFmpeg y asegúrate de que el comando ffmpeg funcione desde la terminal.',
        isError: true,
        loading: false,
      });
    }
  })
  .catch(() => {});
