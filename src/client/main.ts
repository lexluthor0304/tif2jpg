import type { ConvertOptions } from './decode.worker';
import { ZipBuilder } from './zip';

interface FileTask {
  id: string;
  file: File;
  status: 'queued' | 'processing' | 'done' | 'error';
  processedPages: number;
  totalPages: number;
  results: PageResult[];
  element: FileCardElements;
  error?: string;
}

interface PageResult {
  id: string;
  fileId: string;
  name: string;
  blob: Blob;
  url: string;
}

interface FileCardElements {
  root: HTMLLIElement;
  meta: HTMLDivElement;
  status: HTMLSpanElement;
  progress: HTMLSpanElement;
}

type Locale = 'en' | 'zh';

const STRINGS: Record<Locale, Record<string, string>> = {
  en: {
    title: 'TIFF → JPEG (Client-side)',
    privacy: 'Files never leave your device.',
    uploadTitle: 'Drop TIFF files here or select from device',
    dropInstruction: 'Drag & drop your TIFFs',
    dropHelp: 'You can add multiple files at once.',
    selectFiles: 'Select files',
    optionsTitle: 'Conversion options',
    quality: 'JPEG Quality',
    maxDimension: 'Max longer side (px)',
    originalSize: 'Original size',
    stripMetadata: 'Strip metadata',
    pageSelection: 'Pages',
    allPages: 'All pages',
    selectedPages: 'Selected pages',
    pageHint: 'Use commas and ranges (e.g., 1,3-5)',
    convert: 'Convert',
    queueTitle: 'Conversion queue',
    resultsTitle: 'Results',
    downloadZip: 'Download all as ZIP',
    footerNote: 'Powered by Cloudflare Workers + in-browser processing.',
    queued: 'Queued',
    decoding: 'Decoding page',
    encoding: 'Encoding JPEG',
    done: 'Done',
    error: 'Error',
    download: 'Download JPEG',
    sizeLabel: 'Size',
    pagesLabel: 'Pages',
    colorLabel: 'Color',
  },
  zh: {
    title: 'TIFF → JPEG（本地转换）',
    privacy: '文件不会离开您的设备。',
    uploadTitle: '拖放 TIFF 文件或从设备中选择',
    dropInstruction: '拖放您的 TIFF 文件',
    dropHelp: '可以一次添加多个文件。',
    selectFiles: '选择文件',
    optionsTitle: '转换选项',
    quality: 'JPEG 质量',
    maxDimension: '最长边（像素）',
    originalSize: '保持原始尺寸',
    stripMetadata: '移除元数据',
    pageSelection: '页面',
    allPages: '全部页面',
    selectedPages: '选择页面',
    pageHint: '使用逗号和范围（例如：1,3-5）',
    convert: '开始转换',
    queueTitle: '转换队列',
    resultsTitle: '结果',
    downloadZip: '全部下载（ZIP）',
    footerNote: '由 Cloudflare Workers 和浏览器端处理驱动。',
    queued: '已排队',
    decoding: '正在解析页面',
    encoding: '正在编码 JPEG',
    done: '完成',
    error: '错误',
    download: '下载 JPEG',
    sizeLabel: '大小',
    pagesLabel: '页数',
    colorLabel: '色彩',
  },
};

const state = {
  tasks: new Map<string, FileTask>(),
  queue: [] as string[],
  current: null as string | null,
  results: [] as PageResult[],
  locale: detectLocale(),
};

const ui = {
  dropZone: document.getElementById('drop-zone') as HTMLDivElement,
  selectFiles: document.getElementById('select-files') as HTMLButtonElement,
  fileInput: document.getElementById('file-input') as HTMLInputElement,
  convertButton: document.getElementById('convert') as HTMLButtonElement,
  fileList: document.getElementById('file-list') as HTMLUListElement,
  downloadZip: document.getElementById('download-zip') as HTMLButtonElement,
  resultsGrid: document.getElementById('results-grid') as HTMLDivElement,
  qualityRange: document.getElementById('quality') as HTMLInputElement,
  qualityValue: document.getElementById('quality-value') as HTMLOutputElement,
  maxDimension: document.getElementById('max-dimension') as HTMLSelectElement,
  stripMetadata: document.getElementById('strip-metadata') as HTMLInputElement,
  pageInput: document.getElementById('page-input') as HTMLInputElement,
  pageRadios: Array.from(document.querySelectorAll("input[name='page-mode']")) as HTMLInputElement[],
};

applyTranslations(state.locale);

const worker = new Worker(new URL('./decode.worker.ts', import.meta.url), { type: 'module' });
worker.addEventListener('message', handleWorkerMessage);

function openFilePicker() {
  const input = ui.fileInput as HTMLInputElement & { showPicker?: () => void };
  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker();
      return;
    } catch (error) {
      // Some browsers expose showPicker but throw when the input is visually hidden.
    }
  }
  input.click();
}

ui.qualityRange.addEventListener('input', () => {
  ui.qualityValue.textContent = ui.qualityRange.value;
});

ui.pageRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
    const customSelected = ui.pageRadios.find((r) => r.checked)?.value === 'custom';
    ui.pageInput.disabled = !customSelected;
    if (!customSelected) {
      ui.pageInput.value = '';
    }
  });
});

ui.selectFiles.addEventListener('click', () => openFilePicker());
ui.fileInput.addEventListener('change', () => {
  if (ui.fileInput.files) {
    enqueueFiles(Array.from(ui.fileInput.files));
    ui.fileInput.value = '';
  }
});

ui.dropZone.addEventListener('click', (event) => {
  if (event.target instanceof HTMLButtonElement) {
    return;
  }
  openFilePicker();
});

ui.dropZone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openFilePicker();
  }
});

ui.dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  ui.dropZone.classList.add('dragover');
});

ui.dropZone.addEventListener('dragleave', () => {
  ui.dropZone.classList.remove('dragover');
});

ui.dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  ui.dropZone.classList.remove('dragover');
  if (event.dataTransfer?.files) {
    enqueueFiles(Array.from(event.dataTransfer.files));
  }
});

ui.convertButton.addEventListener('click', () => {
  if (!state.current) {
    startQueue();
  }
});

ui.downloadZip.addEventListener('click', async () => {
  if (!state.results.length) return;
  ui.downloadZip.disabled = true;
  ui.downloadZip.textContent = '…';
  try {
    const zip = new ZipBuilder();
    for (const result of state.results) {
      await zip.addFile(result.name, result.blob);
    }
    const blob = await zip.toBlob();
    triggerDownload(blob, 'tiff-to-jpeg.zip');
  } catch (error) {
    console.error(error);
    alert('Failed to build ZIP.');
  } finally {
    ui.downloadZip.disabled = false;
    ui.downloadZip.textContent = STRINGS[state.locale].downloadZip;
  }
});

function enqueueFiles(files: File[]) {
  for (const file of files) {
    if (!/tiff?/i.test(file.type) && !/\.tiff?$/i.test(file.name)) {
      continue;
    }
    const id = generateId();
    const card = createFileCard(file);
    const task: FileTask = {
      id,
      file,
      status: 'queued',
      processedPages: 0,
      totalPages: 0,
      results: [],
      element: card,
    };
    state.tasks.set(id, task);
    state.queue.push(id);
    ui.fileList.appendChild(card.root);
  }
}

function startQueue() {
  if (state.current || !state.queue.length) {
    return;
  }
  const nextId = state.queue.shift();
  if (!nextId) return;
  const task = state.tasks.get(nextId);
  if (!task) {
    startQueue();
    return;
  }
  state.current = nextId;
  task.status = 'processing';
  setStatus(task, 'queued');
  worker.postMessage({
    type: 'convert',
    id: task.id,
    file: task.file,
    options: readOptions(),
  });
}

function readOptions(): ConvertOptions {
  const maxValue = ui.maxDimension.value ? Number(ui.maxDimension.value) : undefined;
  const pageMode = ui.pageRadios.find((r) => r.checked)?.value === 'custom' ? 'custom' : 'all';
  const pageExpression = ui.pageInput.value;
  return {
    quality: Number(ui.qualityRange.value),
    maxDimension: maxValue,
    stripMetadata: ui.stripMetadata.checked,
    pageMode,
    pageExpression,
  };
}

function handleWorkerMessage(event: MessageEvent<any>) {
  const message = event.data;
  const task = state.tasks.get(message.id);
  if (!task) return;

  switch (message.type) {
    case 'probe': {
      task.totalPages = message.pages;
      const info = `${STRINGS[state.locale].sizeLabel}: ${formatSize(task.file.size)} · ${STRINGS[state.locale].pagesLabel}: ${message.pages} · ${STRINGS[state.locale].colorLabel}: ${message.colorSpace}`;
      task.element.meta.textContent = info;
      setStatus(task, 'decoding');
      break;
    }
    case 'status': {
      setStatus(task, message.status);
      if (message.status === 'done') {
        task.processedPages += 1;
        updateProgress(task, (task.processedPages / message.total) * 100);
      } else if (message.status === 'encoding') {
        updateProgress(task, ((message.pageIndex + 0.5) / message.total) * 100);
      } else {
        updateProgress(task, (message.pageIndex / message.total) * 100);
      }
      break;
    }
    case 'page': {
      const result: PageResult = {
        id: generateId(),
        fileId: task.id,
        name: message.name,
        blob: message.blob,
        url: URL.createObjectURL(message.blob),
      };
      task.results.push(result);
      state.results.push(result);
      renderResultCard(result);
      ui.downloadZip.disabled = false;
      break;
    }
    case 'error': {
      task.status = 'error';
      task.error = message.message;
      setStatus(task, 'error', message.message);
      state.current = null;
      startQueue();
      break;
    }
    case 'complete': {
      task.status = 'done';
      setStatus(task, 'done');
      updateProgress(task, 100);
      state.current = null;
      startQueue();
      break;
    }
  }
}

function setStatus(task: FileTask, statusKey: keyof typeof STRINGS['en'], extra?: string) {
  const text = STRINGS[state.locale][statusKey] ?? statusKey;
  task.element.status.textContent = extra ? `${text}: ${extra}` : text;
}

function updateProgress(task: FileTask, value: number) {
  task.element.progress.style.width = `${Math.min(100, Math.max(0, value))}%`;
}

function renderResultCard(result: PageResult) {
  const card = document.createElement('article');
  card.className = 'result-card';

  const img = document.createElement('img');
  img.src = result.url;
  img.alt = result.name;

  const footer = document.createElement('footer');
  const name = document.createElement('span');
  name.textContent = result.name;

  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.textContent = STRINGS[state.locale].download;
  downloadButton.addEventListener('click', () => {
    triggerDownload(result.blob, result.name, result.url);
  });

  footer.appendChild(name);
  footer.appendChild(downloadButton);
  card.appendChild(img);
  card.appendChild(footer);

  ui.resultsGrid.appendChild(card);
}

function triggerDownload(blob: Blob, filename: string, existingUrl?: string) {
  const url = existingUrl ?? URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
  if (!existingUrl) {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

function createFileCard(file: File): FileCardElements {
  const li = document.createElement('li');
  li.className = 'file-card';

  const info = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = file.name;

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${STRINGS[state.locale].sizeLabel}: ${formatSize(file.size)}`;

  const status = document.createElement('span');
  status.className = 'status';
  status.textContent = STRINGS[state.locale].queued;

  const progressContainer = document.createElement('div');
  progressContainer.className = 'progress';
  const progress = document.createElement('span');
  progressContainer.appendChild(progress);

  info.appendChild(title);
  info.appendChild(meta);
  info.appendChild(status);
  info.appendChild(progressContainer);
  li.appendChild(info);

  return { root: li, meta, status, progress };
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function detectLocale(): Locale {
  const language = navigator.language.toLowerCase();
  return language.startsWith('zh') ? 'zh' : 'en';
}

function applyTranslations(locale: Locale) {
  const strings = STRINGS[locale];
  document.querySelectorAll<HTMLElement>('[data-i18n-key]').forEach((element) => {
    const key = element.dataset.i18nKey as keyof typeof strings;
    const translation = strings[key];
    if (translation) {
      element.textContent = translation;
    }
  });
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

window.addEventListener('beforeunload', () => {
  for (const result of state.results) {
    URL.revokeObjectURL(result.url);
  }
});
