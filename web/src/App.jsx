import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import './App.css';
import { saveTemplateData, getAllTemplateData, deleteTemplateData, migrateOldRefs } from './db.js';
import { validateFaceAnatomy } from './FaceQC.js';

// ========== HELPER: Read file as base64 ==========
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ========== HELPER: Compress base64 image for API (resize + JPEG quality) ==========
function compressBase64Image(base64, maxSize = 1024, quality = 0.8) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      // Resize if larger than maxSize
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL('image/jpeg', quality).split(',')[1];
      resolve(compressed);
    };
    img.onerror = () => resolve(base64); // Fallback to original on error
    img.src = `data:image/jpeg;base64,${base64}`;
  });
}

// ========== HELPER: Fetch with auto-retry on 503/429/500 ==========
async function fetchWithRetry(url, options, maxRetries = 3, logFn = null) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok) return res;
    // Retry on server overload errors
    if ((res.status === 503 || res.status === 429 || res.status === 500) && attempt < maxRetries) {
      const wait = attempt * 3000; // 3s, 6s, 9s
      if (logFn) logFn(`⏳ API ${res.status} — retry ${attempt}/${maxRetries} in ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    // Non-retryable error or max retries reached
    throw new Error(`API: ${res.status}${attempt > 1 ? ` (after ${attempt} tries)` : ''}`);
  }
}

// ========== HELPER: Download base64 image ==========
function downloadBase64(base64Data, mimeType, filename) {
  const link = document.createElement('a');
  link.href = `data:${mimeType};base64,${base64Data}`;
  link.download = filename || `thubinh_${Date.now()}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ========== HELPER: Extract image from Gemini response ==========
function extractImage(data) {
  if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
    for (let i = 0; i < data.candidates[0].content.parts.length; i++) {
      const part = data.candidates[0].content.parts[i];
      if (part.inlineData && part.inlineData.data) {
        return part.inlineData;
      }
    }
  }
  return null;
}

// ========== HELPER: Extract text from Gemini response ==========
function extractText(data) {
  if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
    for (let i = 0; i < data.candidates[0].content.parts.length; i++) {
      if (data.candidates[0].content.parts[i].text) {
        return data.candidates[0].content.parts[i].text;
      }
    }
  }
  return '';
}

// ========== DEFAULT TEMPLATES ==========
const DEFAULT_TEMPLATES = [
  { id: 'baby_studio_mai', name: 'Studio Hoa Mai', icon: '🌼', bgColor: 'linear-gradient(135deg, #f9a825, #fff176)', category: 'baby', description: 'Set studio với cành mai vàng lớn, gối nhung đỏ, ánh sáng ấm', prompt: 'Studio set with large yellow apricot blossom branches (hoa mai), red velvet cushions, warm golden lighting, polished wooden floor, soft bokeh. No text, no banners, no logos, no numbers, no watermarks.' },
  { id: 'baby_studio_lantern', name: 'Studio Đèn Lồng', icon: '🏮', bgColor: 'linear-gradient(135deg, #c62828, #ef5350)', category: 'baby', description: 'Set đèn lồng đỏ treo lơ lửng, nền nhung đỏ, ánh sáng mềm', prompt: 'Studio set with red silk lanterns hanging at different heights, red velvet backdrop, soft diffused lighting, scattered flower petals on floor, dreamy bokeh. No text, no banners, no logos, no numbers, no watermarks.' },
  { id: 'baby_studio_peach', name: 'Studio Hoa Đào', icon: '🌸', bgColor: 'linear-gradient(135deg, #f48fb1, #fce4ec)', category: 'baby', description: 'Cành đào hồng, sàn gỗ, backdrop pastel mềm mại', prompt: 'Studio set with pink peach blossom branches, soft pastel pink and cream backdrop, warm lighting, light wooden floor with scattered pink petals, gentle dreamy atmosphere. No text, no banners, no logos, no numbers, no watermarks.' },
  { id: 'baby_studio_golden', name: 'Studio Vàng Son', icon: '✨', bgColor: 'linear-gradient(135deg, #ff8f00, #ffe082)', category: 'baby', description: 'Background vàng ánh kim, đạo cụ vàng, bokeh lung linh', prompt: 'Studio set with shimmering gold fabric backdrop, golden decorative props and silk ribbons, beautiful golden bokeh lights, warm amber lighting, polished reflective floor. No text, no banners, no logos, no numbers, no watermarks.' },
  { id: 'baby_studio_garden', name: 'Studio Vườn Xuân', icon: '🪴', bgColor: 'linear-gradient(135deg, #66bb6a, #c8e6c9)', category: 'baby', description: 'Set vườn mini, cây kumquat, hoa cúc, thảm cỏ xanh', prompt: 'Studio set with miniature spring garden, small kumquat tree with orange fruits, yellow chrysanthemum flowers, green grass carpet, bright natural lighting, fresh cheerful atmosphere. No text, no banners, no logos, no numbers, no watermarks.' },
  { id: 'family_studio_classic', name: 'Studio Cổ Điển', icon: '🎭', bgColor: 'linear-gradient(135deg, #b71c1c, #d32f2f)', category: 'family', description: 'Backdrop đỏ sang trọng, ghế sofa cổ điển', prompt: 'Studio set with deep red velvet backdrop, classic vintage sofa, professional studio lighting with rim light, red and gold color palette, silk tassels and embroidered cushions, formal portrait atmosphere. No text, no banners, no logos, no numbers, no watermarks.' },
  { id: 'family_studio_blossom', name: 'Studio Hoa Xuân', icon: '💐', bgColor: 'linear-gradient(135deg, #e91e63, #ffd54f)', category: 'family', description: 'Set hoa đào + hoa mai hỗn hợp, thảm đỏ', prompt: 'Studio set with mixed pink peach blossoms and yellow apricot blossoms, red carpet, warm red-to-gold gradient backdrop, elegant studio lighting highlighting flowers, spacious for group photo. No text, no banners, no logos, no numbers, no watermarks.' },
  { id: 'family_studio_elegant', name: 'Studio Thanh Lịch', icon: '🪞', bgColor: 'linear-gradient(135deg, #e0e0e0, #fafafa)', category: 'family', description: 'Nền trắng ngà, rèm voan mỏng, tối giản sang trọng', prompt: 'Minimalist studio with ivory white backdrop, sheer voile curtains, subtle red and gold flower accents, soft diffused lighting, clean sophisticated atmosphere, modern luxury aesthetic. No text, no banners, no logos, no numbers, no watermarks.' },
  { id: 'family_studio_warm', name: 'Studio Ấm Áp', icon: '🕯️', bgColor: 'linear-gradient(135deg, #795548, #d7ccc8)', category: 'family', description: 'Set phòng khách ấm cúng, ánh nến, fairy lights', prompt: 'Cozy studio set with warm brown and cream tones, fairy string lights with soft bokeh, decorative candles, plush cushions, wooden props and ceramic vases with spring flowers, intimate warm atmosphere. No text, no banners, no logos, no numbers, no watermarks.' },
  { id: 'family_studio_royal', name: 'Studio Hoàng Gia', icon: '👑', bgColor: 'linear-gradient(135deg, #4a148c, #ce93d8)', category: 'family', description: 'Backdrop nhung đỏ đậm, khung tranh vàng, trụ đá cẩm thạch', prompt: 'Grand royal studio set with dark burgundy velvet draping, ornate golden picture frames, marble columns, dramatic studio lighting with strong key light and moody shadows, opulent majestic atmosphere. No text, no banners, no logos, no numbers, no watermarks.' },
];

const ASPECT_RATIOS = [
  { id: '1:1', label: '1:1' },
  { id: '2:3', label: '2:3' },
  { id: '3:2', label: '3:2' },
  { id: '3:4', label: '3:4' },
  { id: '4:3', label: '4:3' },
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
];

const PRICING = {
  textInput: 2.00 / 1000000,
  textOutput: 12.00 / 1000000,
  image: 0.134,
};

function App() {
  // Core state
  const [key, setKey] = useState(localStorage.getItem('gemini_key') || '');
  const [keyValid, setKeyValid] = useState(null);
  const [status, setStatus] = useState('Sẵn sàng');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('edit');

  // Result
  const [resultImage, setResultImage] = useState(null); // { data, mimeType }

  // Edit tab
  const [editImage, setEditImage] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [refinedPrompt, setRefinedPrompt] = useState('');
  const [editAspectRatio, setEditAspectRatio] = useState('1:1');

  // Composite tab
  const [bgImage, setBgImage] = useState('');
  const [subjectImage, setSubjectImage] = useState('');
  const [compositePrompt, setCompositePrompt] = useState('');
  const [compositeAspectRatio, setCompositeAspectRatio] = useState('1:1');
  const [optKeepFace, setOptKeepFace] = useState(true);
  const [optKeepPose, setOptKeepPose] = useState(true);
  const [optMatchLight, setOptMatchLight] = useState(true);

  // Template tab
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateSubjectImage, setTemplateSubjectImage] = useState('');
  const [templateAspectRatio, setTemplateAspectRatio] = useState('3:4');
  const [templateData, setTemplateData] = useState({}); // { templateId: { prompt, refImages, thumbnail, isCustom, name, ... } }
  const [editingTemplate, setEditingTemplate] = useState(null); // template being edited
  const [editForm, setEditForm] = useState({ name: '', prompt: '', description: '', icon: '', category: '' });
  const templateRefFileRef = useRef(null);
  const [refUploadTarget, setRefUploadTarget] = useState(null);

  // Upscale tab
  const [upscaleImage, setUpscaleImage] = useState('');

  // Face Swap tab
  const [faceRefImage, setFaceRefImage] = useState('');
  const [faceTargetImage, setFaceTargetImage] = useState('');

  // Batch tab
  const [batchFiles, setBatchFiles] = useState([]); // File objects
  const [batchMode, setBatchMode] = useState('composite'); // 'composite' or 'template'
  const [batchBgImage, setBatchBgImage] = useState('');
  const [batchSelectedTemplate, setBatchSelectedTemplate] = useState(null);
  const [batchPrompt, setBatchPrompt] = useState('');
  const [batchAspectRatio, setBatchAspectRatio] = useState('1:1');
  const [batchOptKeepFace, setBatchOptKeepFace] = useState(true);
  const [batchOptKeepPose, setBatchOptKeepPose] = useState(true);
  const [batchOptMatchLight, setBatchOptMatchLight] = useState(true);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, running: false });
  const [batchResults, setBatchResults] = useState([]); // { fileName, status, message, imageData, mimeType }

  // Cost tracking
  const [costs, setCosts] = useState({ textInputTokens: 0, textOutputTokens: 0, imageCount: 0 });

  // Refs for file inputs
  const editFileRef = useRef(null);
  const bgFileRef = useRef(null);
  const subjectFileRef = useRef(null);
  const templateFileRef = useRef(null);
  const upscaleFileRef = useRef(null);
  const faceRefFileRef = useRef(null);
  const faceTargetFileRef = useRef(null);
  const batchFileRef = useRef(null);
  const batchBgFileRef = useRef(null);

  // Logs toggle
  const [showLogs, setShowLogs] = useState(false);

  // ========== Load saved template data from IndexedDB on mount ==========
  useEffect(() => {
    (async () => {
      try {
        // Load new template_data store
        const data = await getAllTemplateData();
        // Migrate old template_refs if any
        const oldRefs = await migrateOldRefs();
        if (Object.keys(oldRefs).length > 0) {
          for (const [id, images] of Object.entries(oldRefs)) {
            if (!data[id]) data[id] = {};
            if (!data[id].refImages) {
              data[id].refImages = images;
              await saveTemplateData(id, { refImages: images });
            }
          }
        }
        setTemplateData(data);
        const count = Object.keys(data).length;
        if (count > 0) console.log(`Loaded ${count} template data entries from IndexedDB`);
      } catch (err) {
        console.warn('IndexedDB load error:', err);
      }
    })();
  }, []);

  // ========== Merged template list ==========
  const allTemplates = useMemo(() => {
    // Start with defaults, apply overrides
    const merged = DEFAULT_TEMPLATES.map(t => {
      const d = templateData[t.id];
      if (!d) return { ...t, refImages: [], thumbnail: null };
      return {
        ...t,
        name: d.name || t.name,
        prompt: d.prompt || t.prompt,
        description: d.description || t.description,
        icon: d.icon || t.icon,
        thumbnail: d.thumbnail || null,
        refImages: d.refImages || [],
      };
    });
    // Add custom templates
    Object.values(templateData).forEach(d => {
      if (d.isCustom && !merged.find(t => t.id === d.id)) {
        merged.push({
          id: d.id,
          name: d.name || 'Custom Template',
          icon: d.icon || '🎨',
          bgColor: d.bgColor || 'linear-gradient(135deg, #667eea, #764ba2)',
          category: d.category || 'custom',
          description: d.description || '',
          prompt: d.prompt || '',
          thumbnail: d.thumbnail || null,
          refImages: d.refImages || [],
          isCustom: true,
        });
      }
    });
    return merged;
  }, [templateData]);

  // ========== UTILITY FUNCTIONS ==========
  const addLog = useCallback((msg) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  function addCost(type, amount) {
    setCosts(prev => {
      const n = { ...prev };
      if (type === 'textInput') n.textInputTokens += amount;
      else if (type === 'textOutput') n.textOutputTokens += amount;
      else if (type === 'image') n.imageCount += amount;
      return n;
    });
  }

  function getTotalCost() {
    return (costs.textInputTokens * PRICING.textInput) + (costs.textOutputTokens * PRICING.textOutput) + (costs.imageCount * PRICING.image);
  }

  const apiUrl = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key.trim()}`;

  // ========== FILE UPLOAD HANDLER ==========
  async function handleFileUpload(e, setter) {
    const file = e.target.files[0];
    if (!file) return;
    addLog(`File selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
    const b64 = await readFileAsBase64(file);
    setter(b64);
    addLog(`Loaded: ${b64.length} chars`);
  }

  // ========== DRAG & DROP ==========
  function handleDrop(e, setter) {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      readFileAsBase64(file).then(b64 => {
        setter(b64);
        addLog(`Dropped: ${file.name}`);
      });
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // ========== VERIFY KEY ==========
  async function handleVerifyKey() {
    const cleanKey = key.trim();
    if (!cleanKey) { alert('Vui lòng nhập API Key'); return; }
    setLoading(true);
    setStatus('Đang kiểm tra Key...');
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`);
      if (res.ok) {
        setKeyValid(true);
        setStatus('Key hợp lệ!');
        localStorage.setItem('gemini_key', cleanKey);
        addLog('Key verified OK');
      } else {
        setKeyValid(false);
        setStatus('Key sai!');
        addLog('Key invalid');
      }
    } catch (e) {
      setKeyValid(false);
      setStatus('Lỗi mạng');
      addLog('Network error: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  // ========== EDIT: REFINE PROMPT ==========
  async function handleRefinePrompt() {
    if (!key.trim()) { alert('Thiếu Key'); return; }
    if (!userPrompt) { alert('Nhập yêu cầu'); return; }
    if (!editImage) { alert('Chưa upload ảnh'); return; }

    setLoading(true);
    addLog('=== REFINE PROMPT ===');
    try {
      setStatus('Gửi Gemini...');
      const res = await fetchWithRetry(apiUrl('gemini-2.0-flash'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: `Based on this image, create a prompt for AI to: "${userPrompt}". Return ONLY the English prompt.` },
              { inlineData: { mimeType: 'image/jpeg', data: editImage } }
            ]
          }]
        })
      });
      if (!res.ok) throw new Error('API failed: ' + res.status);
      const data = await res.json();
      const text = extractText(data);
      if (text) {
        setRefinedPrompt(text);
        setStatus('Prompt đã tinh chỉnh!');
        addLog('Got refined prompt');
        addCost('textInput', 500);
        addCost('textOutput', 100);
      } else throw new Error('No result');
    } catch (e) {
      addLog('Error: ' + e.message);
      setStatus('Lỗi');
    } finally {
      setLoading(false);
    }
  }

  // ========== EDIT: GENERATE ==========
  async function handleGenerate() {
    if (!refinedPrompt) return;
    if (!editImage) { alert('Chưa có ảnh gốc.'); return; }

    setLoading(true);
    addLog('=== GENERATE ===');
    try {
      setStatus('Chỉnh sửa ảnh...');
      const res = await fetchWithRetry(apiUrl('gemini-3-pro-image-preview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: editImage } },
              { text: refinedPrompt }
            ]
          }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { imageSize: '4K', aspectRatio: editAspectRatio } }
        })
      });
      if (!res.ok) throw new Error('API failed: ' + res.status);
      const data = await res.json();
      const img = extractImage(data);
      if (img) {
        setResultImage(img);
        setStatus('Xong!');
        addCost('image', 1);
        addCost('textInput', 1000);
        addLog('Image generated!');
      } else throw new Error('No image returned');
    } catch (e) {
      addLog('Error: ' + e.message);
      setStatus('Lỗi');
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ========== COMPOSITE ==========
  async function handleComposite() {
    if (!subjectImage) { alert('Chưa upload subject!'); return; }
    if (!bgImage) { alert('Chưa upload background!'); return; }

    setLoading(true);
    addLog('=== COMPOSITE ===');
    try {
      let prompt = 'Composite the subject onto this background.';
      if (optKeepFace) prompt += ' Keep the subject face exactly the same.';
      if (optKeepPose) prompt += ' Maintain exact same body pose.';
      if (optMatchLight) prompt += ' Match lighting and color temperature.';
      prompt += ' Make it photorealistic.';
      if (compositePrompt) prompt += ' ' + compositePrompt;

      let finalResult = null;
      // Pre-compress images for faster API
      const compBg = await compressBase64Image(bgImage, 1536, 0.85);
      const compSubject = await compressBase64Image(subjectImage, 1536, 0.85);
      addLog(`Compressed: BG=${(compBg.length / 1024).toFixed(0)}KB Subject=${(compSubject.length / 1024).toFixed(0)}KB`);

      for (let attempt = 1; attempt <= 2; attempt++) {
        setStatus(attempt === 1 ? 'Ghép nền với AI...' : 'Đang sửa lỗi giải phẫu...');
        let currentPrompt = prompt;
        if (attempt > 1) currentPrompt += ` URGENT FIX: Previous result had anatomical issues. Correct: ${finalResult?._qcIssues || 'face/body anatomy'}. Verify eye symmetry and skin texture.`;

        const res = await fetchWithRetry(apiUrl('gemini-3-pro-image-preview'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: 'BACKGROUND IMAGE:' },
                { inlineData: { mimeType: 'image/jpeg', data: compBg } },
                { text: 'SUBJECT TO COMPOSITE:' },
                { inlineData: { mimeType: 'image/jpeg', data: compSubject } },
                { text: 'INSTRUCTION: ' + currentPrompt }
              ]
            }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { imageSize: '4K', aspectRatio: compositeAspectRatio } }
          })
        });
        if (!res.ok) throw new Error('API failed: ' + res.status);
        const data = await res.json();
        const img = extractImage(data);
        if (!img) throw new Error('No image');
        addCost('image', 1);
        addCost('textInput', 2000);

        // QC Check
        setStatus('Kiểm tra giải phẫu...');
        addLog(`QC Check (${attempt}/2)...`);
        const qc = await validateFaceAnatomy(subjectImage, img.data, key.trim());
        addCost('textInput', 800);

        if (qc.pass) {
          addLog(`✓ QC Passed (Score: ${qc.score})`);
          setResultImage(img);
          setStatus('Xong! (QC ✅)');
          addLog('Composite done!');
          finalResult = img;
          break;
        } else {
          addLog(`⚠ QC Fail (${attempt}/2): ${qc.issues}`);
          finalResult = img;
          finalResult._qcIssues = qc.issues;
          if (attempt === 2) {
            setResultImage(img);
            setStatus('Xong! (QC ⚠️ Retry)');
            addLog('Accepting after retry limit.');
          }
        }
      }
    } catch (e) {
      addLog('Error: ' + e.message);
      setStatus('Lỗi');
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ========== TEMPLATE (BG REPLACE + AD QC) ==========
  async function handleTemplateComposite() {
    if (!templateSubjectImage) { alert('Chưa upload subject!'); return; }
    if (!selectedTemplate) { alert('Chưa chọn template!'); return; }

    setLoading(true);
    addLog('=== TEMPLATE (BG REPLACE + AD QC) ===');
    try {
      const template = allTemplates.find(t => t.id === selectedTemplate);
      if (!template) throw new Error('Template không tìm thấy');
      addLog('Template: ' + template.name);

      // Pre-compress ALL images first (reused across all 3 steps)
      const refImages = template.refImages || [];
      const hasRefs = refImages.length > 0;
      const compressedRefs = hasRefs ? await Promise.all(refImages.map(img => compressBase64Image(img, 1024, 0.75))) : [];
      const compressedSubject = await compressBase64Image(templateSubjectImage, 1536, 0.85);
      addLog(`Compressed: subject=${(compressedSubject.length / 1024).toFixed(0)}KB, refs=${compressedRefs.length}`);

      // Step 1: AD Analyze (uses compressed subject)
      setStatus('AD 1/3: Phân tích ảnh...');
      addLog('--- STEP 1: AD Analyze ---');
      const analyzeRes = await fetchWithRetry(apiUrl('gemini-2.0-flash'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: compressedSubject } },
              { text: 'Analyze briefly. JSON only:\n{"num_people":number,"pose":"standing/sitting","lighting":"direction and temp","dof":"shallow/medium/deep","focal_length":"mm","camera_distance":"close/medium/far"}' }
            ]
          }]
        })
      });
      let adInfo = '{}';
      if (analyzeRes.ok) {
        const aData = await analyzeRes.json();
        adInfo = extractText(aData) || '{}';
        addLog('AD: ' + adInfo.substring(0, 200));
      }
      addCost('textInput', 300);

      // Step 2: Background Replacement
      addLog(hasRefs ? `Using ${refImages.length} reference image(s)` : 'No reference images, using text prompt only');

      const doReplace = async (attempt, qcFix) => {
        setStatus(`AD ${attempt === 1 ? '2/3' : '2R/3'}: Thay background...`);
        addLog(`--- STEP 2: BG Replace #${attempt} ---`);

        let editPrompt = `Replace ONLY the background. Keep person(s) 100% unchanged (face, body, pose, clothes). NEW BG: ${template.prompt}. ANALYSIS: ${adInfo}. RULES: Match original DOF/bokeh, camera angle, lighting direction/color temp. Natural ground contact. Photorealistic result.`;
        if (hasRefs) editPrompt += ' Match REFERENCE IMAGES style exactly.';
        if (qcFix) editPrompt += ' FIX: ' + qcFix;

        // Build parts array with compressed images
        const parts = [];
        if (hasRefs) {
          parts.push({ text: 'REFERENCE STUDIO IMAGES:' });
          compressedRefs.forEach(refB64 => {
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: refB64 } });
          });
        }
        parts.push({ text: 'SUBJECT PHOTO (keep unchanged):' });
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: compressedSubject } });
        parts.push({ text: editPrompt });

        const res = await fetchWithRetry(apiUrl('gemini-3-pro-image-preview'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { imageSize: '4K', aspectRatio: templateAspectRatio } }
          })
        });
        if (!res.ok) throw new Error('Replace failed: ' + res.status);
        const data = await res.json();
        const img = extractImage(data);
        if (!img) throw new Error('No image returned');
        addLog('Done! ' + (img.data.length / 1024).toFixed(0) + 'KB');
        addCost('image', 1);
        addCost('textInput', 1500);
        return img;
      };

      let result = await doReplace(1, null);

      // Step 3: AD QC (use compressed images for speed)
      setStatus('AD 3/3: QC kiểm tra...');
      addLog('--- STEP 3: QC ---');
      const compResult = await compressBase64Image(result.data, 768, 0.7);
      const qcRes = await fetchWithRetry(apiUrl('gemini-2.0-flash'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'ORIGINAL:' },
              { inlineData: { mimeType: 'image/jpeg', data: compressedSubject } },
              { text: 'RESULT:' },
              { inlineData: { mimeType: 'image/jpeg', data: compResult } },
              { text: 'QC: Compare. JSON only:\n{"face_match":1-10,"pose_match":1-10,"dof_consistency":1-10,"lighting_match":1-10,"realism":1-10,"overall":1-10,"pass":true/false(>=7),"issues":"what to fix"}' }
            ]
          }]
        })
      });
      addCost('textInput', 800);
      let qcPassed = true;
      let qcIssues = '';
      if (qcRes.ok) {
        const qcData = await qcRes.json();
        const qcText = extractText(qcData);
        addLog('QC: ' + qcText.substring(0, 300));
        try {
          const cQc = qcText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const qc = JSON.parse(cQc);
          addLog(`Scores: Face=${qc.face_match} Pose=${qc.pose_match} DOF=${qc.dof_consistency} Realism=${qc.realism} Overall=${qc.overall}`);
          if (qc.pass === false && qc.overall < 7) {
            qcPassed = false;
            qcIssues = qc.issues || 'Fix realism and DOF.';
            addLog('QC FAILED — Retry: ' + qcIssues);
          } else addLog('QC PASSED!');
        } catch { addLog('QC parse err, accepting'); }
      }

      if (!qcPassed) {
        addLog('=== RETRY ===');
        result = await doReplace(2, qcIssues);
      }

      setResultImage(result);
      setStatus(qcPassed ? 'Xong! (QC ✅)' : 'Xong! (Retry)');
      addLog('DONE!');
    } catch (e) {
      addLog('Error: ' + e.message);
      setStatus('Lỗi');
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ========== UPSCALE 4K ==========
  async function handleUpscale() {
    if (!upscaleImage) { alert('Chưa upload ảnh!'); return; }
    if (!key.trim()) { alert('Thiếu Key'); return; }

    setLoading(true);
    addLog('=== UPSCALE 4K ===');
    try {
      setStatus('Đang upscale lên 4K...');
      const res = await fetchWithRetry(apiUrl('gemini-3-pro-image-preview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: upscaleImage } },
              { text: 'Upscale this image to 4K resolution while preserving all details, colors, textures and quality. Keep the exact same content, composition and style. Do not add, remove or modify any elements. Just enhance the resolution and clarity to 4K quality.' }
            ]
          }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { imageSize: '4K' } }
        })
      });
      if (!res.ok) throw new Error('API failed: ' + res.status);
      const data = await res.json();
      const img = extractImage(data);
      if (img) {
        setResultImage(img);
        setStatus('Upscale 4K xong!');
        addCost('image', 1);
        addCost('textInput', 1000);
        addLog('Upscaled!');
      } else throw new Error('No image');
    } catch (e) {
      addLog('Error: ' + e.message);
      setStatus('Lỗi');
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ========== FACE SWAP ==========
  async function handleFaceSwap() {
    if (!faceRefImage) { alert('Chưa upload khuôn mặt mẫu!'); return; }
    if (!faceTargetImage) { alert('Chưa upload ảnh mục tiêu!'); return; }
    if (!key.trim()) { alert('Thiếu Key'); return; }

    setLoading(true);
    addLog('=== FACE SWAP ===');
    try {
      const basePrompt = `You are a professional face replacement AI. Replace the face in the TARGET IMAGE with the face from the REFERENCE IMAGE. CRITICAL: 1. Face must be EXACTLY identical to REFERENCE. 2. Keep pose, body from TARGET. 3. Match lighting naturally. 4. Result must look completely natural. IMAGE 1 = REFERENCE FACE. IMAGE 2 = TARGET.`;

      // Pre-compress for faster API
      const compRef = await compressBase64Image(faceRefImage, 1536, 0.85);
      const compTarget = await compressBase64Image(faceTargetImage, 1536, 0.85);
      addLog(`Compressed: Ref=${(compRef.length / 1024).toFixed(0)}KB Target=${(compTarget.length / 1024).toFixed(0)}KB`);

      let finalResult = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        setStatus(attempt === 1 ? 'Đang thay thế khuôn mặt...' : 'Đang sửa lỗi giải phẫu...');
        let prompt = basePrompt;
        if (attempt > 1) prompt += ` URGENT FIX: Previous result had anatomical issues: ${finalResult?._qcIssues || 'face anatomy error'}. Correct eye symmetry, skin texture, and facial proportions.`;

        const res = await fetchWithRetry(apiUrl('gemini-3-pro-image-preview'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inlineData: { mimeType: 'image/jpeg', data: compRef } },
                { inlineData: { mimeType: 'image/jpeg', data: compTarget } }
              ]
            }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { imageSize: '4K' } }
          })
        });
        if (!res.ok) throw new Error('API failed: ' + res.status);
        const data = await res.json();
        const img = extractImage(data);
        if (!img) throw new Error('No image');
        addCost('image', 1);
        addCost('textInput', 2000);

        // QC Check - compare result face with reference face
        setStatus('Kiểm tra giải phẫu...');
        addLog(`QC Check (${attempt}/2)...`);
        const qc = await validateFaceAnatomy(faceRefImage, img.data, key.trim());
        addCost('textInput', 800);

        if (qc.pass) {
          addLog(`✓ QC Passed (Score: ${qc.score})`);
          setResultImage(img);
          setStatus('Face swap xong! (QC ✅)');
          addLog('Face swapped!');
          finalResult = img;
          break;
        } else {
          addLog(`⚠ QC Fail (${attempt}/2): ${qc.issues}`);
          finalResult = img;
          finalResult._qcIssues = qc.issues;
          if (attempt === 2) {
            setResultImage(img);
            setStatus('Face swap xong! (QC ⚠️)');
            addLog('Accepting after retry limit.');
          }
        }
      }
    } catch (e) {
      addLog('Error: ' + e.message);
      setStatus('Lỗi');
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ========== DOWNLOAD RESULT ==========
  function handleDownload() {
    if (!resultImage) return;
    downloadBase64(resultImage.data, resultImage.mimeType || 'image/png', `thubinh_${activeTab}_${Date.now()}.png`);
    addLog('Downloaded');
  }

  // ========== BATCH: Select multiple files ==========
  function handleBatchFilesSelect(e) {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    setBatchFiles(files);
    addLog(`Batch: selected ${files.length} images`);
    setStatus(`Đã chọn ${files.length} ảnh`);
  }

  // ========== BATCH PROCESS ==========
  async function handleBatchProcess() {
    if (batchFiles.length === 0) { alert('Chưa chọn ảnh!'); return; }
    if (batchMode === 'composite' && !batchBgImage) { alert('Chưa upload background!'); return; }
    if (batchMode === 'template' && !batchSelectedTemplate) { alert('Chưa chọn template!'); return; }
    const cleanKey = key.trim();
    if (!cleanKey) { alert('Vui lòng nhập API Key!'); return; }

    setLoading(true);
    setBatchProgress({ current: 0, total: batchFiles.length, running: true });
    setBatchResults([]);
    addLog('=== AUTO BATCH START ===');
    addLog(`Mode: ${batchMode}, Files: ${batchFiles.length}`);

    const results = [];

    // Pre-compress batch background (once, outside the loop)
    const compBatchBg = batchMode === 'composite' ? await compressBase64Image(batchBgImage, 1536, 0.85) : null;
    // Pre-compress batch template refs (once, outside the loop)
    let compBatchRefs = [];
    if (batchMode === 'template') {
      const template = allTemplates.find(t => t.id === batchSelectedTemplate);
      if (template) {
        let refImages = [...(template.refImages || [])];
        if (template.thumbnail) refImages = [template.thumbnail, ...refImages];
        refImages = [...new Set(refImages)];
        compBatchRefs = await Promise.all(refImages.map(img => compressBase64Image(img, 1024, 0.75)));
      }
    }
    addLog(`Pre-compressed: bg=${compBatchBg ? (compBatchBg.length / 1024).toFixed(0) + 'KB' : 'N/A'}, refs=${compBatchRefs.length}`);

    for (let i = 0; i < batchFiles.length; i++) {
      const file = batchFiles[i];
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      setBatchProgress({ current: i + 1, total: batchFiles.length, running: true });
      setStatus(`Đang xử lý ${i + 1}/${batchFiles.length}: ${file.name}`);
      addLog(`--- [${i + 1}/${batchFiles.length}]: ${file.name} ---`);

      try {
        const subjectB64 = await readFileAsBase64(file);
        const compSubject = await compressBase64Image(subjectB64, 1536, 0.85);
        let requestBody;

        if (batchMode === 'composite') {
          let prompt = 'Composite the subject onto this background.';
          if (batchOptKeepFace) prompt += ' Keep the subject face exactly the same.';
          if (batchOptKeepPose) prompt += ' Maintain exact same body pose.';
          if (batchOptMatchLight) prompt += ' Match lighting and color temperature.';
          prompt += ' Make it photorealistic.';
          if (batchPrompt) prompt += ' ' + batchPrompt;

          requestBody = {
            contents: [{
              parts: [
                { text: 'BACKGROUND IMAGE:' },
                { inlineData: { mimeType: 'image/jpeg', data: compBatchBg } },
                { text: 'SUBJECT TO COMPOSITE:' },
                { inlineData: { mimeType: 'image/jpeg', data: compSubject } },
                { text: 'INSTRUCTION: ' + prompt }
              ]
            }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { imageSize: '4K', aspectRatio: batchAspectRatio } }
          };
        } else {
          const template = allTemplates.find(t => t.id === batchSelectedTemplate);
          if (!template) throw new Error('Template không tìm thấy');

          const hasRefs = compBatchRefs.length > 0;

          let tplPrompt = `Generate a background based on: ${template.prompt}. Composite the subject onto it. Keep all faces, poses exactly same. Match lighting. Photorealistic. 4K.`;
          if (hasRefs) tplPrompt += ' Match REFERENCE IMAGES style exactly.';

          const parts = [];
          if (hasRefs) {
            parts.push({ text: 'REFERENCE STUDIO IMAGES:' });
            compBatchRefs.forEach(img => {
              parts.push({ inlineData: { mimeType: 'image/jpeg', data: img } });
            });
          }
          parts.push({ text: 'SUBJECT(S) TO COMPOSITE:' });
          parts.push({ inlineData: { mimeType: 'image/jpeg', data: compSubject } });
          parts.push({ text: 'INSTRUCTION: ' + tplPrompt });

          requestBody = {
            contents: [{ parts }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { imageSize: '4K', aspectRatio: batchAspectRatio } }
          };
        }



        // ========== QC LOOP (Max 2 attempts) ==========
        let qcIssues = '';
        let finalImg = null;
        let success = false;

        for (let attempt = 1; attempt <= 2; attempt++) {
          if (attempt > 1) {
            addLog(`⟳ Retry #${attempt} fixing: ${qcIssues}`);
            // Append fix instruction to the last text part of prompt
            const parts = requestBody.contents[0].parts;
            const lastTextPart = parts[parts.length - 1];
            if (lastTextPart && lastTextPart.text) {
              lastTextPart.text += ` URGENT FIX: The previous result had anatomical errors: ${qcIssues}. Correct the face/body anatomy completely. Verify eye symmetry and skin texture.`;
            }
          }

          const res = await fetchWithRetry(apiUrl('gemini-3-pro-image-preview'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          });

          if (!res.ok) throw new Error('API: ' + res.status);
          const data = await res.json();
          const img = extractImage(data);

          if (!img) break;

          // QC Check
          addLog(`Analyzing Anatomy (${attempt}/2)...`);
          const qc = await validateFaceAnatomy(subjectB64, img.data, key.trim());

          if (qc.pass) {
            finalImg = img;
            success = true;
            addLog(`✓ QC Passed (Score: ${qc.score})`);
            break;
          } else {
            addLog(`⚠ QC Fail: ${qc.issues}`);
            qcIssues = qc.issues;
            if (attempt === 2) {
              finalImg = img; // Accept result after max retries
              addLog('⚠ Accepting result after retry limit.');
            }
          }
        }

        if (finalImg) {
          addLog(`✓ ${file.name} saved`);
          results.push({
            fileName: file.name,
            baseName,
            status: success ? 'success' : 'warning',
            message: success ? 'OK' : `QC Issues: ${qcIssues}`,
            imageData: finalImg.data,
            mimeType: finalImg.mimeType || 'image/png'
          });
          // Cost: count actual attempts (image gen + QC per attempt)
          const numAttempts = success ? 1 : 2;
          addCost('image', numAttempts);
          addCost('textInput', numAttempts * 2500);
        } else throw new Error('No image returned');
      } catch (e) {
        addLog(`✗ ${file.name}: ${e.message}`);
        results.push({ fileName: file.name, baseName, status: 'error', message: e.message });
      }
      setBatchResults([...results]);
    }

    const ok = results.filter(r => r.status === 'success').length;
    const fail = results.filter(r => r.status === 'error').length;
    setBatchProgress({ current: batchFiles.length, total: batchFiles.length, running: false });
    setStatus(`Batch xong! ${ok} thành công, ${fail} lỗi`);
    addLog(`=== BATCH DONE: ${ok} OK / ${fail} ERR ===`);
    setLoading(false);
  }

  // ========== BATCH: Download one result ==========
  function handleBatchDownloadOne(result) {
    downloadBase64(result.imageData, result.mimeType, `${result.baseName}_batch.png`);
  }

  // ========== BATCH: Download all results ==========
  function handleBatchDownloadAll() {
    const successResults = batchResults.filter(r => r.status === 'success' || r.status === 'warning');
    successResults.forEach((r, i) => {
      setTimeout(() => downloadBase64(r.imageData, r.mimeType, `${r.baseName}_batch.png`), i * 300);
    });
    addLog(`Downloading ${successResults.length} files...`);
  }

  // ========== UPLOAD ZONE COMPONENT ==========
  function UploadZone({ image, setter, fileRef, label }) {
    return (
      <div
        className={`upload-zone ${image ? 'has-image' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDrop={(e) => handleDrop(e, setter)}
        onDragOver={handleDragOver}
      >
        {image ? (
          <img src={`data:image/jpeg;base64,${image}`} alt="uploaded" />
        ) : (
          <>
            <div className="upload-icon">📷</div>
            <div className="upload-text">
              <strong>Click</strong> hoặc <strong>kéo thả</strong> ảnh vào đây<br />
              {label}
            </div>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => handleFileUpload(e, setter)}
        />
      </div>
    );
  }

  // ========== ASPECT RATIO SELECTOR ==========
  function RatioSelector({ value, onChange }) {
    return (
      <div className="ratio-grid">
        {ASPECT_RATIOS.map(r => (
          <button
            key={r.id}
            className={`ratio-btn ${value === r.id ? 'active' : ''}`}
            onClick={() => onChange(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>
    );
  }

  // ========== RENDER TABS ==========
  function renderEditTab() {
    return (
      <div className="fade-in">
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title"><span>🖼️</span> Ảnh gốc</div>
          <UploadZone image={editImage} setter={setEditImage} fileRef={editFileRef} label="Upload ảnh cần chỉnh sửa" />
        </div>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title"><span>✏️</span> Yêu cầu chỉnh sửa</div>
          <div className="input-group">
            <textarea
              className="input-field"
              placeholder="Ví dụ: Thay đổi nền thành bãi biển, thêm ánh hoàng hôn..."
              value={userPrompt}
              onChange={e => setUserPrompt(e.target.value)}
            />
          </div>
          <button className="btn btn-secondary" onClick={handleRefinePrompt} disabled={loading} style={{ marginBottom: 12 }}>
            🔍 Bước 1: Tinh chỉnh Prompt
          </button>
          {refinedPrompt && (
            <div className="input-group">
              <label>Prompt đã tinh chỉnh</label>
              <textarea
                className="input-field"
                value={refinedPrompt}
                onChange={e => setRefinedPrompt(e.target.value)}
                rows={4}
              />
            </div>
          )}
        </div>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title"><span>📐</span> Tỉ lệ</div>
          <RatioSelector value={editAspectRatio} onChange={setEditAspectRatio} />
        </div>
        <button className="btn btn-primary btn-lg" onClick={handleGenerate} disabled={loading || !refinedPrompt} style={{ width: '100%' }}>
          🎨 Bước 2: Tạo ảnh
        </button>
      </div>
    );
  }

  function renderCompositeTab() {
    return (
      <div className="fade-in">
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title"><span>🎭</span> Upload ảnh</div>
          <div className="upload-grid">
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Background</label>
              <UploadZone image={bgImage} setter={setBgImage} fileRef={bgFileRef} label="Ảnh nền" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Subject</label>
              <UploadZone image={subjectImage} setter={setSubjectImage} fileRef={subjectFileRef} label="Ảnh người" />
            </div>
          </div>
        </div>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title"><span>⚙️</span> Tùy chọn</div>
          <div className="toggle-group">
            <div className="toggle-item" onClick={() => setOptKeepFace(!optKeepFace)}>
              <div className={`toggle-switch ${optKeepFace ? 'active' : ''}`}></div>
              <span className="toggle-label">Giữ khuôn mặt</span>
            </div>
            <div className="toggle-item" onClick={() => setOptKeepPose(!optKeepPose)}>
              <div className={`toggle-switch ${optKeepPose ? 'active' : ''}`}></div>
              <span className="toggle-label">Giữ tư thế</span>
            </div>
            <div className="toggle-item" onClick={() => setOptMatchLight(!optMatchLight)}>
              <div className={`toggle-switch ${optMatchLight ? 'active' : ''}`}></div>
              <span className="toggle-label">Match ánh sáng</span>
            </div>
          </div>
          <div className="input-group">
            <label>Yêu cầu thêm (tuỳ chọn)</label>
            <input className="input-field" value={compositePrompt} onChange={e => setCompositePrompt(e.target.value)} placeholder="Thêm yêu cầu..." />
          </div>
          <RatioSelector value={compositeAspectRatio} onChange={setCompositeAspectRatio} />
        </div>
        <button className="btn btn-primary btn-lg" onClick={handleComposite} disabled={loading || !subjectImage || !bgImage} style={{ width: '100%' }}>
          🎨 Ghép ảnh
        </button>
      </div>
    );
  }

  // ========== TEMPLATE MANAGEMENT ==========

  // Upload reference images for a template
  async function handleRefImageUpload(e) {
    if (!refUploadTarget) return;
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    const newImages = [];
    for (const file of files.slice(0, 3)) {
      const b64 = await readFileAsBase64(file);
      // Compress for storage — 1024px max, JPEG 80% quality
      const compressed = await compressBase64Image(b64, 1024, 0.8);
      newImages.push(compressed);
      addLog(`Ref compressed: ${(b64.length / 1024).toFixed(0)}KB → ${(compressed.length / 1024).toFixed(0)}KB`);
    }

    const existing = (templateData[refUploadTarget]?.refImages) || [];
    const merged = [...existing, ...newImages].slice(0, 3);

    await saveTemplateData(refUploadTarget, { refImages: merged });
    setTemplateData(prev => ({ ...prev, [refUploadTarget]: { ...(prev[refUploadTarget] || {}), refImages: merged } }));
    addLog(`Saved ${merged.length} ref image(s) for: ${refUploadTarget}`);
    setRefUploadTarget(null);
  }

  // Delete reference images
  async function handleDeleteRefImages(templateId) {
    await saveTemplateData(templateId, { refImages: [] });
    setTemplateData(prev => ({ ...prev, [templateId]: { ...(prev[templateId] || {}), refImages: [] } }));
    addLog(`Deleted ref images for: ${templateId}`);
  }

  // Start editing a template
  function startEditTemplate(templateId) {
    const t = allTemplates.find(x => x.id === templateId);
    if (!t) return;
    setEditingTemplate(templateId);
    setEditForm({
      name: t.name || '',
      prompt: t.prompt || '',
      description: t.description || '',
      icon: t.icon || '🎨',
      category: t.category || 'custom',
    });
  }

  // Save template edit
  async function handleSaveTemplateEdit() {
    if (!editingTemplate) return;
    const updates = { ...editForm };
    await saveTemplateData(editingTemplate, updates);
    setTemplateData(prev => ({
      ...prev,
      [editingTemplate]: { ...(prev[editingTemplate] || {}), ...updates }
    }));
    addLog(`Template saved: ${editForm.name}`);
    setEditingTemplate(null);
  }

  // Add new custom template
  async function handleAddTemplate() {
    const id = 'custom_' + Date.now();
    const data = {
      isCustom: true,
      name: 'Template mới',
      icon: '🎨',
      bgColor: 'linear-gradient(135deg, #667eea, #764ba2)',
      category: 'custom',
      description: 'Mô tả template...',
      prompt: 'Professional studio setup with...',
      refImages: [],
      thumbnail: null,
    };
    await saveTemplateData(id, data);
    setTemplateData(prev => ({ ...prev, [id]: data }));
    setSelectedTemplate(id);
    startEditTemplate(id);
    addLog(`New template created: ${id}`);
  }

  // Delete custom template
  async function handleDeleteTemplate(templateId) {
    const t = allTemplates.find(x => x.id === templateId);
    if (!t) return;
    if (!confirm(`Xoá template "${t.name}"?`)) return;
    await deleteTemplateData(templateId);
    setTemplateData(prev => {
      const next = { ...prev };
      delete next[templateId];
      return next;
    });
    if (selectedTemplate === templateId) setSelectedTemplate(null);
    setEditingTemplate(null);
    addLog(`Deleted template: ${t.name}`);
  }

  // Reset built-in template to defaults
  async function handleResetTemplate(templateId) {
    const def = DEFAULT_TEMPLATES.find(t => t.id === templateId);
    if (!def) return;
    // Keep refImages and thumbnail, reset text fields
    const data = templateData[templateId] || {};
    const reset = { refImages: data.refImages || [], thumbnail: data.thumbnail || null };
    await saveTemplateData(templateId, reset);
    setTemplateData(prev => ({ ...prev, [templateId]: reset }));
    setEditingTemplate(null);
    addLog(`Reset template to default: ${def.name}`);
  }

  // Generate thumbnail from ref images + prompt
  async function handleGenerateThumbnail(templateId) {
    const template = allTemplates.find(t => t.id === templateId);
    if (!template) return;
    if (!key.trim()) { alert('Thiếu API Key'); return; }

    setLoading(true);
    setStatus('Tạo thumbnail...');
    addLog(`Generating thumbnail for: ${template.name}`);

    try {
      const refImages = template.refImages || [];
      const parts = [];
      if (refImages.length > 0) {
        parts.push({ text: 'Based on these reference studio images:' });
        refImages.forEach(img => parts.push({ inlineData: { mimeType: 'image/jpeg', data: img } }));
      }
      parts.push({ text: `Generate a beautiful EMPTY studio preview (NO people, NO faces, NO human figures) for: ${template.prompt}. Show only the background setup, props, lighting, and atmosphere. This is a thumbnail preview of the studio set.` });

      const res = await fetchWithRetry(apiUrl('gemini-3-pro-image-preview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '1:1' } }
        })
      });
      if (!res.ok) throw new Error('API: ' + res.status);
      const data = await res.json();
      const img = extractImage(data);
      if (img) {
        await saveTemplateData(templateId, { thumbnail: img.data });
        setTemplateData(prev => ({
          ...prev,
          [templateId]: { ...(prev[templateId] || {}), thumbnail: img.data }
        }));
        addLog('Thumbnail generated!');
        setStatus('Thumbnail đã tạo!');
        addCost('image', 1);
      } else throw new Error('No image');
    } catch (e) {
      addLog('Thumbnail error: ' + e.message);
      setStatus('Lỗi tạo thumbnail');
    } finally {
      setLoading(false);
    }
  }

  // ========== TEMPLATE CARD with thumbnail ==========
  function TemplateCard({ t, selected, onSelect }) {
    const hasThumbnail = !!t.thumbnail;
    const hasRefs = (t.refImages || []).length > 0;
    const isCustom = t.isCustom;

    return (
      <div
        className={`template-card ${selected ? 'selected' : ''}`}
        style={{ background: hasThumbnail ? 'none' : t.bgColor, padding: hasThumbnail ? 0 : undefined, overflow: 'hidden' }}
        onClick={() => onSelect(t.id)}
      >
        {hasThumbnail && (
          <img src={`data:image/png;base64,${t.thumbnail}`} alt={t.name}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />
        )}
        {hasRefs && (
          <div style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,230,118,0.9)', color: '#000', fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4, zIndex: 2 }}>📸 {t.refImages.length}</div>
        )}
        {isCustom && (
          <div style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(124,77,255,0.9)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4, zIndex: 2 }}>✨</div>
        )}
        <div className="template-icon" style={{ position: 'relative', zIndex: 1 }}>{t.icon}</div>
        <div className="template-name" style={{ position: 'relative', zIndex: 1, textShadow: hasThumbnail ? '0 1px 4px rgba(0,0,0,0.8)' : 'none' }}>{t.name}</div>
        {!hasThumbnail && <div className="template-desc" style={{ position: 'relative', zIndex: 1 }}>{t.description}</div>}
      </div>
    );
  }

  function renderTemplateTab() {
    const babyTemplates = allTemplates.filter(t => t.category === 'baby');
    const familyTemplates = allTemplates.filter(t => t.category === 'family');
    const customTemplates = allTemplates.filter(t => t.isCustom);
    const selTemplate = selectedTemplate ? allTemplates.find(t => t.id === selectedTemplate) : null;
    const selRefs = selTemplate?.refImages || [];
    const isCustom = selTemplate?.isCustom;
    const isEditing = editingTemplate === selectedTemplate;
    const hasOverride = selectedTemplate && templateData[selectedTemplate] && (templateData[selectedTemplate].prompt || templateData[selectedTemplate].name);

    return (
      <div className="fade-in">
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title"><span>📷</span> Subject</div>
          <UploadZone image={templateSubjectImage} setter={setTemplateSubjectImage} fileRef={templateFileRef} label="Ảnh người cần ghép" />
        </div>

        {/* Template Grid */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ justifyContent: 'space-between' }}>
            <span><span>🎭</span> Chọn Template</span>
            <button className="btn btn-sm btn-secondary" onClick={handleAddTemplate}>➕ Thêm mới</button>
          </div>
          <div className="template-category">👶 Em Bé</div>
          <div className="template-grid">
            {babyTemplates.map(t => (
              <TemplateCard key={t.id} t={t} selected={selectedTemplate === t.id} onSelect={setSelectedTemplate} />
            ))}
          </div>
          <div className="template-category">👨‍👩‍👧‍👦 Gia Đình</div>
          <div className="template-grid">
            {familyTemplates.map(t => (
              <TemplateCard key={t.id} t={t} selected={selectedTemplate === t.id} onSelect={setSelectedTemplate} />
            ))}
          </div>
          {customTemplates.length > 0 && (
            <>
              <div className="template-category">✨ Tùy chỉnh</div>
              <div className="template-grid">
                {customTemplates.map(t => (
                  <TemplateCard key={t.id} t={t} selected={selectedTemplate === t.id} onSelect={setSelectedTemplate} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Template Editor */}
        {selectedTemplate && selTemplate && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ justifyContent: 'space-between' }}>
              <span><span>⚙️</span> {isEditing ? 'Chỉnh sửa Template' : selTemplate.name}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {!isEditing && (
                  <button className="btn btn-sm btn-secondary" onClick={() => startEditTemplate(selectedTemplate)}>
                    ✏️ Sửa
                  </button>
                )}
                {isCustom && (
                  <button className="btn btn-sm btn-danger" onClick={() => handleDeleteTemplate(selectedTemplate)}>🗑️</button>
                )}
                {!isCustom && hasOverride && !isEditing && (
                  <button className="btn btn-sm btn-secondary" onClick={() => handleResetTemplate(selectedTemplate)}>↩️ Reset</button>
                )}
              </div>
            </div>

            {isEditing ? (
              <div>
                <div className="input-group">
                  <label>Tên</label>
                  <input className="input-field" value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="input-group">
                  <label>Icon (emoji)</label>
                  <input className="input-field" value={editForm.icon} onChange={e => setEditForm(p => ({ ...p, icon: e.target.value }))} style={{ width: 60 }} />
                </div>
                <div className="input-group">
                  <label>Danh mục</label>
                  <div className="ratio-grid">
                    {['baby', 'family', 'custom'].map(c => (
                      <button key={c} className={`ratio-btn ${editForm.category === c ? 'active' : ''}`}
                        onClick={() => setEditForm(p => ({ ...p, category: c }))}>
                        {c === 'baby' ? '👶 Em bé' : c === 'family' ? '👨‍👩‍👧‍👦 Gia đình' : '✨ Tùy chỉnh'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="input-group">
                  <label>Mô tả (Tiếng Việt)</label>
                  <input className="input-field" value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} />
                </div>
                <div className="input-group">
                  <label>Prompt (English — mô tả background cho AI)</label>
                  <textarea className="input-field" rows={4} value={editForm.prompt} onChange={e => setEditForm(p => ({ ...p, prompt: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-primary btn-sm" onClick={handleSaveTemplateEdit}>💾 Lưu</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditingTemplate(null)}>Huỷ</button>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                  <strong>Prompt:</strong> {selTemplate.prompt?.substring(0, 150)}{selTemplate.prompt?.length > 150 ? '...' : ''}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Reference Images */}
        {selectedTemplate && selTemplate && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">
              <span>📸</span> Ảnh mẫu studio
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>(Lưu cố định)</span>
            </div>

            {selRefs.length > 0 ? (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {selRefs.map((img, i) => (
                    <div key={i} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <img src={`data:image/jpeg;base64,${img}`} alt={`ref-${i}`} style={{ width: 100, height: 100, objectFit: 'cover', display: 'block' }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {selRefs.length < 3 && (
                    <button className="btn btn-sm btn-secondary" onClick={() => { setRefUploadTarget(selectedTemplate); templateRefFileRef.current?.click(); }}>
                      ➕ Thêm ảnh
                    </button>
                  )}
                  <button className="btn btn-sm btn-danger" onClick={() => handleDeleteRefImages(selectedTemplate)}>
                    🗑️ Xoá ảnh mẫu
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={() => handleGenerateThumbnail(selectedTemplate)} disabled={loading}>
                    🖼️ Tạo Thumbnail
                  </button>
                </div>
              </>
            ) : (
              <div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
                  Upload 1-3 ảnh mẫu studio thật để AI tạo background chính xác hơn.<br />
                  Sau đó nhấn <strong style={{ color: 'var(--accent-light)' }}>"Tạo Thumbnail"</strong> để xem preview.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => { setRefUploadTarget(selectedTemplate); templateRefFileRef.current?.click(); }}>
                    📷 Upload ảnh mẫu
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={() => handleGenerateThumbnail(selectedTemplate)} disabled={loading}>
                    🖼️ Tạo Thumbnail (từ prompt)
                  </button>
                </div>
              </div>
            )}

            {/* Thumbnail preview */}
            {selTemplate.thumbnail && (
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Thumbnail hiện tại:</label>
                <img src={`data:image/png;base64,${selTemplate.thumbnail}`} alt="thumbnail" style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
              </div>
            )}

            <input
              ref={templateRefFileRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={handleRefImageUpload}
            />
          </div>
        )}

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title"><span>📐</span> Tỉ lệ</div>
          <RatioSelector value={templateAspectRatio} onChange={setTemplateAspectRatio} />
        </div>
        <button className="btn btn-primary btn-lg" onClick={handleTemplateComposite} disabled={loading || !templateSubjectImage || !selectedTemplate} style={{ width: '100%' }}>
          🎨 Tạo ảnh Template {selRefs.length > 0 ? `(📸 ${selRefs.length} mẫu)` : ''}
        </button>
      </div>
    );
  }

  function renderUpscaleTab() {
    return (
      <div className="fade-in">
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title"><span>🔍</span> Ảnh cần Upscale</div>
          <UploadZone image={upscaleImage} setter={setUpscaleImage} fileRef={upscaleFileRef} label="Upload ảnh cần nâng cấp 4K" />
        </div>
        <button className="btn btn-primary btn-lg" onClick={handleUpscale} disabled={loading || !upscaleImage} style={{ width: '100%' }}>
          ⬆️ Upscale 4K
        </button>
      </div>
    );
  }

  function renderFaceSwapTab() {
    return (
      <div className="fade-in">
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title"><span>🔄</span> Face Swap</div>
          <div className="upload-grid">
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Khuôn mặt mẫu</label>
              <UploadZone image={faceRefImage} setter={setFaceRefImage} fileRef={faceRefFileRef} label="Mặt cần lấy" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Ảnh mục tiêu</label>
              <UploadZone image={faceTargetImage} setter={setFaceTargetImage} fileRef={faceTargetFileRef} label="Ảnh cần thay mặt" />
            </div>
          </div>
        </div>
        <button className="btn btn-primary btn-lg" onClick={handleFaceSwap} disabled={loading || !faceRefImage || !faceTargetImage} style={{ width: '100%' }}>
          🔄 Thay mặt
        </button>
      </div>
    );
  }

  function renderBatchTab() {
    const babyTemplates = allTemplates.filter(t => t.category === 'baby');
    const familyTemplates = allTemplates.filter(t => t.category === 'family');
    const customTemplates = allTemplates.filter(t => t.isCustom);
    const successCount = batchResults.filter(r => r.status === 'success').length;

    return (
      <div className="fade-in">
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title"><span>📂</span> Chọn ảnh</div>
          <div
            className={`upload-zone ${batchFiles.length > 0 ? 'has-image' : ''}`}
            onClick={() => batchFileRef.current?.click()}
          >
            {batchFiles.length > 0 ? (
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📷 × {batchFiles.length}</div>
                <div className="upload-text">
                  {batchFiles.map(f => f.name).join(', ').substring(0, 150)}{batchFiles.length > 5 ? '...' : ''}
                </div>
                <button className="btn btn-sm btn-secondary" style={{ marginTop: 8 }} onClick={e => { e.stopPropagation(); setBatchFiles([]); }}>🗑️ Xoá</button>
              </div>
            ) : (
              <>
                <div className="upload-icon">📂</div>
                <div className="upload-text"><strong>Click</strong> chọn nhiều ảnh<br />Hỗ trợ JPG, PNG, WebP</div>
              </>
            )}
            <input ref={batchFileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleBatchFilesSelect} />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title"><span>⚙️</span> Chế độ</div>
          <div className="ratio-grid" style={{ marginBottom: 12 }}>
            <button className={`ratio-btn ${batchMode === 'composite' ? 'active' : ''}`} onClick={() => setBatchMode('composite')}>🎭 Ghép nền</button>
            <button className={`ratio-btn ${batchMode === 'template' ? 'active' : ''}`} onClick={() => setBatchMode('template')}>🏮 Template</button>
          </div>

          {batchMode === 'composite' && (
            <>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Background chung</label>
              <UploadZone image={batchBgImage} setter={setBatchBgImage} fileRef={batchBgFileRef} label="Ảnh nền dùng chung" />
              <div className="toggle-group" style={{ marginTop: 12 }}>
                <div className="toggle-item" onClick={() => setBatchOptKeepFace(!batchOptKeepFace)}>
                  <div className={`toggle-switch ${batchOptKeepFace ? 'active' : ''}`}></div>
                  <span className="toggle-label">Giữ khuôn mặt</span>
                </div>
                <div className="toggle-item" onClick={() => setBatchOptKeepPose(!batchOptKeepPose)}>
                  <div className={`toggle-switch ${batchOptKeepPose ? 'active' : ''}`}></div>
                  <span className="toggle-label">Giữ tư thế</span>
                </div>
                <div className="toggle-item" onClick={() => setBatchOptMatchLight(!batchOptMatchLight)}>
                  <div className={`toggle-switch ${batchOptMatchLight ? 'active' : ''}`}></div>
                  <span className="toggle-label">Match ánh sáng</span>
                </div>
              </div>
              <div className="input-group">
                <label>Yêu cầu thêm</label>
                <input className="input-field" value={batchPrompt} onChange={e => setBatchPrompt(e.target.value)} placeholder="Tuỳ chọn..." />
              </div>
            </>
          )}

          {batchMode === 'template' && (
            <>
              <div className="template-category">👶 Em Bé</div>
              <div className="template-grid">
                {babyTemplates.map(t => (
                  <TemplateCard key={t.id} t={t} selected={batchSelectedTemplate === t.id} onSelect={setBatchSelectedTemplate} />
                ))}
              </div>
              <div className="template-category">👨‍👩‍👧‍👦 Gia Đình</div>
              <div className="template-grid">
                {familyTemplates.map(t => (
                  <TemplateCard key={t.id} t={t} selected={batchSelectedTemplate === t.id} onSelect={setBatchSelectedTemplate} />
                ))}
              </div>
              {customTemplates.length > 0 && (
                <>
                  <div className="template-category">✨ Tùy chỉnh</div>
                  <div className="template-grid">
                    {customTemplates.map(t => (
                      <TemplateCard key={t.id} t={t} selected={batchSelectedTemplate === t.id} onSelect={setBatchSelectedTemplate} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title"><span>📐</span> Tỉ lệ</div>
          <RatioSelector value={batchAspectRatio} onChange={setBatchAspectRatio} />
        </div>

        <button className="btn btn-primary btn-lg" onClick={handleBatchProcess} disabled={loading || batchFiles.length === 0} style={{ width: '100%', marginBottom: 16 }}>
          🚀 Chạy Batch ({batchFiles.length} ảnh)
        </button>

        {/* Progress */}
        {batchProgress.total > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title"><span>📊</span> Tiến trình {batchProgress.current}/{batchProgress.total}</div>
            <div style={{ background: 'var(--bg-input)', borderRadius: 6, height: 8, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%`, height: '100%', background: 'var(--gradient-accent)', borderRadius: 6, transition: 'width 0.3s' }}></div>
            </div>
            {successCount > 0 && (
              <button className="btn btn-success btn-sm" onClick={handleBatchDownloadAll}>
                💾 Tải tất cả ({successCount} ảnh)
              </button>
            )}
          </div>
        )}

        {/* Results */}
        {batchResults.length > 0 && (
          <div className="card">
            <div className="card-title"><span>📋</span> Kết quả</div>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {batchResults.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{r.status === 'success' ? '✅' : r.status === 'warning' ? '⚠️' : '❌'}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{r.fileName}</span>
                  </div>
                  {(r.status === 'success' || r.status === 'warning') && (
                    <button className="btn btn-sm btn-secondary" onClick={() => handleBatchDownloadOne(r)}>💾</button>
                  )}
                  {r.status === 'warning' && (
                    <span style={{ fontSize: 11, color: '#ff9800' }}>{r.message.substring(0, 50)}</span>
                  )}
                  {r.status === 'error' && (
                    <span style={{ fontSize: 11, color: 'var(--danger)' }}>{r.message.substring(0, 40)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ========== MAIN RENDER ==========
  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <h1><span>📷</span> Thu Bình Camera <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>📞 0914003345</span></h1>
        <div className="api-key-bar">
          {keyValid !== null && <span className={`key-status ${keyValid ? 'valid' : 'invalid'}`}></span>}
          <input
            type="password"
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="Gemini API Key..."
            onKeyDown={e => e.key === 'Enter' && handleVerifyKey()}
          />
          <button className="btn btn-secondary btn-sm" onClick={handleVerifyKey} disabled={loading}>
            ✓ Xác thực
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="tabs-container">
        {[
          { id: 'edit', icon: '✏️', label: 'Chỉnh sửa' },
          { id: 'composite', icon: '🎭', label: 'Ghép nền' },
          { id: 'template', icon: '🏮', label: 'Template' },
          { id: 'upscale', icon: '⬆️', label: 'Upscale 4K' },
          { id: 'faceswap', icon: '🔄', label: 'Face Swap' },
          { id: 'batch', icon: '📂', label: 'Batch' },
        ].map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Left - Controls */}
        <div>
          {activeTab === 'edit' && renderEditTab()}
          {activeTab === 'composite' && renderCompositeTab()}
          {activeTab === 'template' && renderTemplateTab()}
          {activeTab === 'upscale' && renderUpscaleTab()}
          {activeTab === 'faceswap' && renderFaceSwapTab()}
          {activeTab === 'batch' && renderBatchTab()}
        </div>

        {/* Right - Result + Logs */}
        <div className="sidebar">
          <div className="card">
            <div className="card-title"><span>🖼️</span> Kết quả</div>
            <div className="result-area">
              {resultImage ? (
                <>
                  <img src={`data:${resultImage.mimeType || 'image/png'};base64,${resultImage.data}`} alt="result" />
                  <button className="download-btn" onClick={handleDownload}>
                    💾 Tải về
                  </button>
                </>
              ) : (
                <div className="result-placeholder">
                  <div className="placeholder-icon">🎨</div>
                  <p>Kết quả sẽ hiện ở đây</p>
                </div>
              )}
            </div>
          </div>

          {/* Status Bar */}
          <div className="status-bar">
            <div className="status-text">
              <span className={`status-dot ${loading ? 'loading' : ''}`}></span>
              {status}
            </div>
            <div className="cost-display">
              <span>🖼️ {costs.imageCount}</span>
              <span className="cost-value">${getTotalCost().toFixed(3)}</span>
            </div>
          </div>

          {/* Logs */}
          <div className="logs-panel">
            <div className="logs-header" onClick={() => setShowLogs(!showLogs)}>
              <h3>📋 Logs {logs.length > 0 && `(${logs.length})`}</h3>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{showLogs ? '▼' : '▶'}</span>
            </div>
            {showLogs && (
              <div className="logs-body">
                {logs.map((log, i) => (
                  <div key={i} className="log-entry">{log}</div>
                ))}
                {logs.length === 0 && <div className="log-entry" style={{ color: 'var(--text-muted)' }}>Chưa có log...</div>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div className="loading-overlay">
          <div style={{ textAlign: 'center' }}>
            <div className="loading-spinner"></div>
            <div className="loading-text">{status}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
