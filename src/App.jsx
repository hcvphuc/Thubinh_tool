import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
const { getLayerAsBase64, placeBase64, setLogFunction, readFileAsBase64, saveBase64ToFile } = require('./utils/photoshop');

function App() {
    const [key, setKey] = useState(localStorage.getItem('gemini_key') || '');
    const [keyValid, setKeyValid] = useState(null);
    const [userPrompt, setUserPrompt] = useState('');
    const [refinedPrompt, setRefinedPrompt] = useState('');
    const [capturedImage, setCapturedImage] = useState('');  // Store original image for editing
    const [status, setStatus] = useState('Sẵn sàng');
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState([]);

    // Tab navigation
    const [activeTab, setActiveTab] = useState('edit');  // 'edit' or 'composite'

    // Background Compositing states
    const [backgroundImage, setBackgroundImage] = useState('');
    const [subjectImage, setSubjectImage] = useState('');
    const [compositePrompt, setCompositePrompt] = useState('');

    // Composite options
    const [optKeepFace, setOptKeepFace] = useState(true);
    const [optKeepPose, setOptKeepPose] = useState(true);
    const [optMatchLight, setOptMatchLight] = useState(true);

    // Template Compositing states
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [templateSubjectImage, setTemplateSubjectImage] = useState('');

    // Aspect Ratio states for all tabs
    const [editAspectRatio, setEditAspectRatio] = useState('1:1');
    const [compositeAspectRatio, setCompositeAspectRatio] = useState('1:1');
    const [templateAspectRatio, setTemplateAspectRatio] = useState('1:1');

    // Face Swap states
    const [faceReferenceImage, setFaceReferenceImage] = useState('');
    const [faceTargetImage, setFaceTargetImage] = useState('');

    // Auto Batch states
    const [batchInputFiles, setBatchInputFiles] = useState([]);
    const [batchInputFolder, setBatchInputFolder] = useState(null);
    const [batchInputFolderName, setBatchInputFolderName] = useState('');
    const [batchOutputFolder, setBatchOutputFolder] = useState(null);
    const [batchOutputFolderName, setBatchOutputFolderName] = useState('');
    const [batchBackgroundImage, setBatchBackgroundImage] = useState('');
    const [batchMode, setBatchMode] = useState('composite'); // 'composite' or 'template'
    const [batchSelectedTemplate, setBatchSelectedTemplate] = useState(null);
    const [batchPrompt, setBatchPrompt] = useState('');
    const [batchAspectRatio, setBatchAspectRatio] = useState('1:1');
    const [batchOptKeepFace, setBatchOptKeepFace] = useState(true);
    const [batchOptKeepPose, setBatchOptKeepPose] = useState(true);
    const [batchOptMatchLight, setBatchOptMatchLight] = useState(true);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, running: false });
    const [batchResults, setBatchResults] = useState([]);  // { fileName, status: 'success'|'error', message }


    // Predefined Aspect Ratios
    const ASPECT_RATIOS = [
        { id: '1:1', label: '1:1 (Vuông)', value: '1:1' },
        { id: '2:3', label: '2:3 (Dọc)', value: '2:3' },
        { id: '3:2', label: '3:2 (Ngang)', value: '3:2' },
        { id: '3:4', label: '3:4 (Dọc)', value: '3:4' },
        { id: '4:3', label: '4:3 (Ngang)', value: '4:3' },
        { id: '16:9', label: '16:9 (HD)', value: '16:9' },
        { id: '9:16', label: '9:16 (Story)', value: '9:16' }
    ];

    // Predefined Templates - Tết Studio Concept Edition
    const TEMPLATES = [
        // === TẾT STUDIO - EM BÉ (1-3 bé, 1-5 tuổi) ===
        {
            id: 'baby_studio_mai',
            name: 'Studio Hoa Mai',
            icon: '🌼',
            bgColor: 'linear-gradient(135deg, #f9a825 0%, #fff176 100%)',
            category: 'baby',
            description: 'Set studio với cành mai vàng lớn, gối nhung đỏ, ánh sáng ấm',
            prompt: 'Studio set with large yellow apricot blossom branches (hoa mai), red velvet cushions, warm golden lighting, polished wooden floor, soft bokeh. No text, no banners, no logos, no numbers, no watermarks.',
            options: { keepFace: true, keepPose: true, matchLight: true }
        },
        {
            id: 'baby_studio_lantern',
            name: 'Studio Đèn Lồng',
            icon: '🏮',
            bgColor: 'linear-gradient(135deg, #c62828 0%, #ef5350 100%)',
            category: 'baby',
            description: 'Set đèn lồng đỏ treo lơ lửng, nền nhung đỏ, ánh sáng mềm',
            prompt: 'Studio set with red silk lanterns hanging at different heights, red velvet backdrop, soft diffused lighting, scattered flower petals on floor, dreamy bokeh. No text, no banners, no logos, no numbers, no watermarks.',
            options: { keepFace: true, keepPose: true, matchLight: true }
        },
        {
            id: 'baby_studio_peach',
            name: 'Studio Hoa Đào',
            icon: '🌸',
            bgColor: 'linear-gradient(135deg, #f48fb1 0%, #fce4ec 100%)',
            category: 'baby',
            description: 'Cành đào hồng trong studio, sàn gỗ, backdrop pastel mềm mại',
            prompt: 'Studio set with pink peach blossom branches, soft pastel pink and cream backdrop, warm lighting, light wooden floor with scattered pink petals, gentle dreamy atmosphere. No text, no banners, no logos, no numbers, no watermarks.',
            options: { keepFace: true, keepPose: true, matchLight: true }
        },
        {
            id: 'baby_studio_golden',
            name: 'Studio Vàng Son',
            icon: '✨',
            bgColor: 'linear-gradient(135deg, #ff8f00 0%, #ffe082 100%)',
            category: 'baby',
            description: 'Background vàng ánh kim, đạo cụ vàng, bokeh lung linh',
            prompt: 'Studio set with shimmering gold fabric backdrop, golden decorative props and silk ribbons, beautiful golden bokeh lights, warm amber lighting, polished reflective floor. No text, no banners, no logos, no numbers, no watermarks.',
            options: { keepFace: true, keepPose: true, matchLight: true }
        },
        {
            id: 'baby_studio_garden',
            name: 'Studio Vườn Xuân',
            icon: '🪴',
            bgColor: 'linear-gradient(135deg, #66bb6a 0%, #c8e6c9 100%)',
            category: 'baby',
            description: 'Set vườn mini trong studio, cây kumquat, hoa cúc, thảm cỏ xanh',
            prompt: 'Studio set with miniature spring garden, small kumquat tree with orange fruits, yellow chrysanthemum flowers, green grass carpet, bright natural lighting, fresh cheerful atmosphere. No text, no banners, no logos, no numbers, no watermarks.',
            options: { keepFace: true, keepPose: true, matchLight: true }
        },

        // === TẾT STUDIO - GIA ĐÌNH (3-6 người) ===
        {
            id: 'family_studio_classic',
            name: 'Studio Cổ Điển',
            icon: '🎭',
            bgColor: 'linear-gradient(135deg, #b71c1c 0%, #d32f2f 100%)',
            category: 'family',
            description: 'Backdrop đỏ sang trọng, ghế sofa cổ điển, ánh đèn studio chuyên nghiệp',
            prompt: 'Studio set with deep red velvet backdrop, classic vintage sofa, professional studio lighting with rim light, red and gold color palette, silk tassels and embroidered cushions, formal portrait atmosphere. No text, no banners, no logos, no numbers, no watermarks.',
            options: { keepFace: true, keepPose: true, matchLight: true }
        },
        {
            id: 'family_studio_blossom',
            name: 'Studio Hoa Xuân',
            icon: '💐',
            bgColor: 'linear-gradient(135deg, #e91e63 0%, #ffd54f 100%)',
            category: 'family',
            description: 'Set hoa đào + hoa mai hỗn hợp, thảm đỏ, backdrop gradient đỏ-vàng',
            prompt: 'Studio set with mixed pink peach blossoms and yellow apricot blossoms, red carpet, warm red-to-gold gradient backdrop, elegant studio lighting highlighting flowers, spacious for group photo. No text, no banners, no logos, no numbers, no watermarks.',
            options: { keepFace: true, keepPose: true, matchLight: true }
        },
        {
            id: 'family_studio_elegant',
            name: 'Studio Thanh Lịch',
            icon: '🪞',
            bgColor: 'linear-gradient(135deg, #e0e0e0 0%, #fafafa 100%)',
            category: 'family',
            description: 'Nền trắng ngà, rèm voan mỏng, ánh sáng mềm, tối giản sang trọng',
            prompt: 'Minimalist studio with ivory white backdrop, sheer voile curtains, subtle red and gold flower accents, soft diffused lighting, clean sophisticated atmosphere, modern luxury aesthetic. No text, no banners, no logos, no numbers, no watermarks.',
            options: { keepFace: true, keepPose: true, matchLight: true }
        },
        {
            id: 'family_studio_warm',
            name: 'Studio Ấm Áp',
            icon: '🕯️',
            bgColor: 'linear-gradient(135deg, #795548 0%, #d7ccc8 100%)',
            category: 'family',
            description: 'Set phòng khách ấm cúng, ánh nến, fairy lights, tông nâu ấm',
            prompt: 'Cozy studio set with warm brown and cream tones, fairy string lights with soft bokeh, decorative candles, plush cushions, wooden props and ceramic vases with spring flowers, intimate warm atmosphere. No text, no banners, no logos, no numbers, no watermarks.',
            options: { keepFace: true, keepPose: true, matchLight: true }
        },
        {
            id: 'family_studio_royal',
            name: 'Studio Hoàng Gia',
            icon: '👑',
            bgColor: 'linear-gradient(135deg, #4a148c 0%, #ce93d8 100%)',
            category: 'family',
            description: 'Backdrop nhung đỏ đậm, khung tranh vàng, trụ đá cẩm thạch, ánh sáng drama',
            prompt: 'Grand royal studio set with dark burgundy velvet draping, ornate golden picture frames, marble columns, dramatic studio lighting with strong key light and moody shadows, opulent majestic atmosphere. No text, no banners, no logos, no numbers, no watermarks.',
            options: { keepFace: true, keepPose: true, matchLight: true }
        }
    ];

    // Cost tracking
    const [showCost, setShowCost] = useState(true);
    const [costs, setCosts] = useState({
        textInputTokens: 0,
        textOutputTokens: 0,
        imageCount: 0,
        sessions: 0
    });

    // Pricing (per 1M tokens for text, per image for images)
    const PRICING = {
        textInput: 2.00 / 1000000,   // $2.00 per 1M tokens
        textOutput: 12.00 / 1000000, // $12.00 per 1M tokens  
        image: 0.134                  // $0.134 per image
    };

    function addCost(type, amount) {
        setCosts(function (prev) {
            var newCosts = Object.assign({}, prev);
            if (type === 'textInput') newCosts.textInputTokens += amount;
            else if (type === 'textOutput') newCosts.textOutputTokens += amount;
            else if (type === 'image') newCosts.imageCount += amount;
            else if (type === 'session') newCosts.sessions += 1;
            return newCosts;
        });
    }

    function getTotalCost() {
        return (costs.textInputTokens * PRICING.textInput) +
            (costs.textOutputTokens * PRICING.textOutput) +
            (costs.imageCount * PRICING.image);
    }

    function resetCosts() {
        setCosts({ textInputTokens: 0, textOutputTokens: 0, imageCount: 0, sessions: 0 });
    }

    // Use ref for logging function to avoid closure issues
    const addLogRef = React.useRef(null);

    function addLog(msg) {
        const time = new Date().toLocaleTimeString();
        setLogs(function (prev) { return [('[' + time + '] ' + msg)].concat(prev).slice(0, 50); });
    }

    // Connect photoshop.js logging
    addLogRef.current = addLog;
    useEffect(function () {
        setLogFunction(function (msg) {
            if (addLogRef.current) addLogRef.current(msg);
        });
    }, []);


    async function handleVerifyKey() {
        var cleanKey = key.trim();
        if (!cleanKey) { alert("Vui lòng nhập API Key"); return; }

        setLoading(true);
        setStatus("Đang kiểm tra Key...");
        addLog("Bắt đầu xác thực...");

        try {
            var url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + cleanKey;
            addLog("Gọi API...");
            var res = await fetch(url);
            addLog("HTTP: " + res.status);

            if (res.ok) {
                setKeyValid(true);
                setStatus("Key hợp lệ!");
                addLog("OK!");
                localStorage.setItem('gemini_key', cleanKey);
            } else {
                setKeyValid(false);
                setStatus("Key sai!");
                addLog("Lỗi API");
            }
        } catch (e) {
            addLog("Network Error: " + e.message);
            setKeyValid(false);
            setStatus("Lỗi mạng");
        } finally {
            setLoading(false);
        }
    }

    async function handleRefinePrompt() {
        var cleanKey = key.trim();
        if (!cleanKey) { alert("Thiếu Key"); return; }
        if (!userPrompt) { alert("Nhập yêu cầu"); return; }

        setLoading(true);
        addLog("=== STEP 1 ===");

        try {
            setStatus("Đang chụp ảnh...");
            addLog("getLayerAsBase64...");
            var b64 = await getLayerAsBase64();
            addLog("Chụp OK: " + b64.length + " chars");
            setCapturedImage(b64);  // Save for Step 2

            setStatus("Gửi Gemini...");
            addLog("POST Gemini API...");
            var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + cleanKey, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: 'Based on this image, create a prompt for AI to: "' + userPrompt + '". Return ONLY the English prompt.' },
                            { inline_data: { mime_type: "image/jpeg", data: b64 } }
                        ]
                    }]
                })
            });

            addLog("Gemini: " + res.status);
            if (!res.ok) throw new Error("Gemini failed");

            var data = await res.json();
            var result = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;

            if (result) {
                addLog("Got prompt!");
                setRefinedPrompt(result);
                setStatus("Xong Step 1!");
                // Track cost: estimate ~500 input tokens (image + prompt), ~100 output tokens
                addCost('textInput', 500);
                addCost('textOutput', 100);
                addCost('session', 1);
            } else {
                throw new Error("No result");
            }
        } catch (e) {
            addLog("Error: " + e.message);
            setStatus("Lỗi");
        } finally {
            setLoading(false);
        }
    }

    async function handleGenerateAndPlace() {
        if (!refinedPrompt) return;
        if (!capturedImage) { alert("Chưa có ảnh gốc. Hãy chạy Bước 1 trước."); return; }
        var cleanKey = key.trim();

        setLoading(true);
        addLog("=== STEP 2 ===");

        try {
            setStatus("Chỉnh sửa ảnh với Gemini...");
            addLog("POST generateContent with image + prompt...");

            // Send BOTH the original image AND the editing prompt
            // Using Gemini 3 Pro Image Preview (Nano Banana Pro)
            var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=' + cleanKey, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                inlineData: {
                                    mimeType: "image/jpeg",
                                    data: capturedImage
                                }
                            },
                            { text: refinedPrompt }
                        ]
                    }],
                    generationConfig: {
                        responseModalities: ["TEXT", "IMAGE"],
                        imageConfig: {
                            imageSize: "4K",
                            aspectRatio: editAspectRatio
                        }
                    }
                })
            });

            addLog("HTTP: " + res.status);

            if (!res.ok) {
                var errText = await res.text();
                addLog("Error: " + errText.substring(0, 150));
                throw new Error("API failed: " + res.status);
            }

            var data = await res.json();
            addLog("Got response");

            // Find image part in response
            var imagePart = null;
            if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
                for (var i = 0; i < data.candidates[0].content.parts.length; i++) {
                    var part = data.candidates[0].content.parts[i];
                    if (part.inlineData && part.inlineData.data) {
                        imagePart = part.inlineData;
                        break;
                    }
                }
            }

            if (imagePart) {
                addLog("Image found! Length: " + imagePart.data.length);
                addLog("Placing...");
                await placeBase64("data:" + (imagePart.mimeType || "image/png") + ";base64," + imagePart.data);
                addLog("DONE!");
                setStatus("Xong!");
                // Track cost: 1 image generated
                addCost('image', 1);
                addCost('textInput', 1000);  // ~1000 tokens for image + prompt
            } else {
                addLog("No image in response");
                addLog("Response: " + JSON.stringify(data).substring(0, 200));
                throw new Error("No image returned");
            }
        } catch (e) {
            addLog("Error: " + e.message);
            setStatus("Lỗi");
            alert(e.message);
        } finally {
            setLoading(false);
        }
    }

    // === BACKGROUND COMPOSITING FUNCTIONS ===

    async function handleCaptureSubject() {
        setLoading(true);
        addLog("=== CAPTURE SUBJECT ===");
        try {
            setStatus("Đang chụp subject...");
            var b64 = await getLayerAsBase64();
            setSubjectImage(b64);
            addLog("Subject captured: " + b64.length + " chars");
            setStatus("Subject OK!");
        } catch (e) {
            addLog("Error: " + e.message);
            setStatus("Lỗi");
        } finally {
            setLoading(false);
        }
    }

    async function handleBackgroundUpload() {
        try {
            addLog("Opening file picker...");
            const fs = require('uxp').storage.localFileSystem;
            const file = await fs.getFileForOpening({
                types: ['jpg', 'jpeg', 'png', 'gif', 'webp']
            });

            if (!file) {
                addLog("File selection cancelled");
                return;
            }

            addLog("Loading: " + file.name);
            const formats = require('uxp').storage.formats;
            const data = await file.read({ format: formats.binary });

            // Convert to base64
            let binary = '';
            const bytes = new Uint8Array(data);
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const b64 = btoa(binary);
            setBackgroundImage(b64);
            addLog("Background loaded: " + b64.length + " chars");
        } catch (e) {
            addLog("Error loading file: " + e.message);
        }
    }

    async function handleComposite() {
        if (!subjectImage) { alert("Chưa chụp subject! Nhấn 'Chụp Subject' trước."); return; }
        if (!backgroundImage) { alert("Chưa chọn background!"); return; }

        var cleanKey = key.trim();
        setLoading(true);
        addLog("=== COMPOSITE ===");

        try {
            setStatus("Ghép nền với AI...");

            // Build prompt based on options
            var basePrompt = "Composite the subject onto this background.";
            var optionPrompts = [];

            if (optKeepFace) {
                optionPrompts.push("IMPORTANT: Keep the subject's face exactly the same, do not modify facial features, expression, or identity.");
            }
            if (optKeepPose) {
                optionPrompts.push("Maintain the exact same body pose and positioning of the subject.");
            }
            if (optMatchLight) {
                optionPrompts.push("Match the lighting, color temperature, and shadows to blend naturally with the background.");
            }

            optionPrompts.push("Make it look photorealistic and natural.");

            if (compositePrompt) {
                optionPrompts.push("Additional instructions: " + compositePrompt);
            }

            var prompt = basePrompt + " " + optionPrompts.join(" ");
            addLog("Prompt: " + prompt.substring(0, 80) + "...");

            var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=' + cleanKey, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: "BACKGROUND IMAGE:" },
                            { inlineData: { mimeType: "image/jpeg", data: backgroundImage } },
                            { text: "SUBJECT TO COMPOSITE:" },
                            { inlineData: { mimeType: "image/jpeg", data: subjectImage } },
                            { text: "INSTRUCTION: " + prompt }
                        ]
                    }],
                    generationConfig: {
                        responseModalities: ["TEXT", "IMAGE"],
                        imageConfig: {
                            imageSize: "4K",
                            aspectRatio: compositeAspectRatio
                        }
                    }
                })
            });

            addLog("HTTP: " + res.status);

            if (!res.ok) {
                var errText = await res.text();
                addLog("Error: " + errText.substring(0, 150));
                throw new Error("API failed: " + res.status);
            }

            var data = await res.json();
            addLog("Got response");

            var imagePart = null;
            if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
                for (var i = 0; i < data.candidates[0].content.parts.length; i++) {
                    var part = data.candidates[0].content.parts[i];
                    if (part.inlineData && part.inlineData.data) {
                        imagePart = part.inlineData;
                        break;
                    }
                }
            }

            if (imagePart) {
                addLog("Composite done! Length: " + imagePart.data.length);
                await placeBase64("data:" + (imagePart.mimeType || "image/png") + ";base64," + imagePart.data);
                addLog("DONE!");
                setStatus("Xong!");
                addCost('image', 1);
                addCost('textInput', 2000);
            } else {
                throw new Error("No composite returned");
            }
        } catch (e) {
            addLog("Error: " + e.message);
            setStatus("Lỗi");
            alert(e.message);
        } finally {
            setLoading(false);
        }
    }

    // === TEMPLATE COMPOSITING FUNCTIONS ===

    async function handleCaptureTemplateSubject() {
        setLoading(true);
        addLog("=== CAPTURE TEMPLATE SUBJECT ===");
        try {
            setStatus("Đang chụp subject...");
            var b64 = await getLayerAsBase64();
            setTemplateSubjectImage(b64);
            addLog("Template subject captured: " + b64.length + " chars");
            setStatus("Subject OK!");
        } catch (e) {
            addLog("Error: " + e.message);
            setStatus("Lỗi");
        } finally {
            setLoading(false);
        }
    }

    async function handleTemplateComposite() {
        if (!templateSubjectImage) { alert("Chưa chụp subject! Nhấn 'Chụp Subject' trước."); return; }
        if (!selectedTemplate) { alert("Chưa chọn template!"); return; }

        var cleanKey = key.trim();
        setLoading(true);
        addLog("=== TEMPLATE (BG REPLACE + AD QC) ===");

        try {
            var template = TEMPLATES.find(function (t) { return t.id === selectedTemplate; });
            if (!template) { throw new Error("Template không tìm thấy"); }
            addLog("Template: " + template.name);

            // ========== STEP 1: AD Analyze ==========
            setStatus("AD 1/3: Phân tích ảnh...");
            addLog("--- STEP 1: AD Analyze ---");

            var analyzeRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + cleanKey, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { inlineData: { mimeType: "image/jpeg", data: templateSubjectImage } },
                            { text: "Analyze this photo briefly. Respond in JSON only (no markdown):\n{\"num_people\":number,\"pose\":\"standing/sitting/etc\",\"lighting\":\"direction and temperature\",\"dof\":\"shallow/medium/deep and approximate f-stop\",\"focal_length\":\"estimated mm\",\"camera_distance\":\"close/medium/far\"}" }
                        ]
                    }]
                })
            });

            var adInfo = "{}";
            if (analyzeRes.ok) {
                var aData = await analyzeRes.json();
                if (aData.candidates && aData.candidates[0] && aData.candidates[0].content && aData.candidates[0].content.parts) {
                    for (var a = 0; a < aData.candidates[0].content.parts.length; a++) {
                        if (aData.candidates[0].content.parts[a].text) { adInfo = aData.candidates[0].content.parts[a].text; break; }
                    }
                }
                addLog("AD: " + adInfo.substring(0, 200));
            } else { addLog("AD failed, continuing"); }
            addCost('textInput', 300);

            // ========== STEP 2: Background Replacement (single unified image) ==========
            var doReplace = async function (attempt, qcFix) {
                setStatus("AD " + (attempt === 1 ? "2/3" : "2R/3") + ": Thay background...");
                addLog("--- STEP 2: BG Replace #" + attempt + " ---");

                var editPrompt = "Edit this photo by replacing ONLY the background. " +
                    "Keep every single pixel of the person(s) COMPLETELY UNCHANGED - their face, body, pose, clothing, accessories, hair, expression must remain 100% identical to the original photo. " +
                    "NEW BACKGROUND: " + template.prompt + " " +
                    "PHOTO ANALYSIS: " + adInfo + " " +
                    "CRITICAL PHOTOGRAPHY RULES: " +
                    "1. DEPTH OF FIELD: The new background must have the SAME depth of field as the original photo. If the original has shallow DOF (blurry background), the new background must also be blurry at the same level. Match the bokeh style. " +
                    "2. PERSPECTIVE: Match the exact same camera angle, focal length, and perspective distortion as the original photo. " +
                    "3. LIGHTING: The background lighting must come from the SAME direction as the light on the person(s) in the original. Match color temperature. " +
                    "4. COLOR GRADING: The entire image must have unified, consistent color grading as if shot on one camera with one color profile. " +
                    "5. GROUND CONTACT: The person's feet/base must naturally connect with the new ground/floor surface. " +
                    "6. REALISM: Everything in the background must look like a real photograph, not AI-generated. Real textures, real imperfections, real depth. " +
                    "The result must look like this person was ACTUALLY photographed in this location with a professional camera.";

                if (qcFix) { editPrompt += " ADDITIONAL FIX: " + qcFix; }

                var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=' + cleanKey, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { inlineData: { mimeType: "image/jpeg", data: templateSubjectImage } },
                                { text: editPrompt }
                            ]
                        }],
                        generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { imageSize: "4K", aspectRatio: templateAspectRatio } }
                    })
                });

                addLog("Replace HTTP: " + res.status);
                if (!res.ok) { var err = await res.text(); addLog("Err: " + err.substring(0, 300)); throw new Error("Replace failed: " + res.status); }

                var data = await res.json();
                var img = null;
                if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
                    for (var i = 0; i < data.candidates[0].content.parts.length; i++) {
                        if (data.candidates[0].content.parts[i].inlineData) { img = data.candidates[0].content.parts[i].inlineData; break; }
                    }
                }
                if (!img) { throw new Error("No image returned"); }
                addLog("Done! " + img.data.length + " chars");
                addCost('image', 1); addCost('textInput', 1500);
                return img;
            };

            var result = await doReplace(1, null);

            // ========== STEP 3: AD QC ==========
            setStatus("AD 3/3: QC kiểm tra...");
            addLog("--- STEP 3: QC ---");

            var qcRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + cleanKey, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: "ORIGINAL:" },
                            { inlineData: { mimeType: "image/jpeg", data: templateSubjectImage } },
                            { text: "RESULT:" },
                            { inlineData: { mimeType: result.mimeType || "image/png", data: result.data } },
                            { text: "QC Director: Compare. JSON only:\n{\"face_match\":1-10,\"pose_match\":1-10,\"dof_consistency\":1-10,\"lighting_match\":1-10,\"realism\":1-10,\"overall\":1-10,\"pass\":true/false(>=7),\"issues\":\"what to fix\"}" }
                        ]
                    }]
                })
            });

            addCost('textInput', 800);
            var qcPassed = true;
            var qcIssues = "";

            if (qcRes.ok) {
                var qcData = await qcRes.json();
                var qcText = "";
                if (qcData.candidates && qcData.candidates[0] && qcData.candidates[0].content && qcData.candidates[0].content.parts) {
                    for (var q = 0; q < qcData.candidates[0].content.parts.length; q++) {
                        if (qcData.candidates[0].content.parts[q].text) { qcText = qcData.candidates[0].content.parts[q].text; break; }
                    }
                }
                addLog("QC: " + qcText.substring(0, 300));
                try {
                    var cQc = qcText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                    var qc = JSON.parse(cQc);
                    addLog("Scores: Face=" + qc.face_match + " Pose=" + qc.pose_match + " DOF=" + qc.dof_consistency + " Realism=" + qc.realism + " Overall=" + qc.overall);
                    if (qc.pass === false && qc.overall < 7) {
                        qcPassed = false;
                        qcIssues = qc.issues || "Fix realism and DOF.";
                        addLog("QC FAILED — Retry: " + qcIssues);
                    } else { addLog("QC PASSED!"); }
                } catch (e) { addLog("QC parse err, accepting"); }
            }

            if (!qcPassed) {
                addLog("=== RETRY ===");
                result = await doReplace(2, qcIssues);
            }

            await placeBase64("data:" + (result.mimeType || "image/png") + ";base64," + result.data);
            addLog("DONE!");
            setStatus(qcPassed ? "Xong! (QC ✅)" : "Xong! (Retry)");

        } catch (e) {
            addLog("Error: " + e.message);
            setStatus("Lỗi");
            alert(e.message);
        } finally {
            setLoading(false);
        }
    }











// === UPSCALE 4K FUNCTION ===
async function handleUpscale4K() {
    var cleanKey = key.trim();
    if (!cleanKey) { alert("Vui lòng nhập API Key trước!"); return; }

    setLoading(true);
    addLog("=== UPSCALE 4K ===");

    try {
        // Step 1: Capture current layer
        setStatus("Đang chụp ảnh gốc...");
        addLog("Capturing layer...");
        var b64 = await getLayerAsBase64();
        addLog("Captured: " + b64.length + " chars");

        // Step 2: Send to Gemini for upscale
        setStatus("Đang upscale lên 4K...");
        addLog("Sending to Gemini for 4K upscale...");

        var prompt = "Upscale this image to 4K resolution while preserving all details, colors, textures and quality. Keep the exact same content, composition and style. Do not add, remove or modify any elements. Just enhance the resolution and clarity to 4K quality.";

        var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=' + cleanKey, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            inlineData: {
                                mimeType: "image/jpeg",
                                data: b64
                            }
                        },
                        { text: prompt }
                    ]
                }],
                generationConfig: {
                    responseModalities: ["TEXT", "IMAGE"],
                    imageConfig: {
                        imageSize: "4K"
                    }
                }
            })
        });

        addLog("HTTP: " + res.status);

        if (!res.ok) {
            var errText = await res.text();
            addLog("Error: " + errText.substring(0, 150));
            throw new Error("API failed: " + res.status);
        }

        var data = await res.json();
        addLog("Got response");

        // Find image part in response
        var imagePart = null;
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
            for (var i = 0; i < data.candidates[0].content.parts.length; i++) {
                var part = data.candidates[0].content.parts[i];
                if (part.inlineData && part.inlineData.data) {
                    imagePart = part.inlineData;
                    break;
                }
            }
        }

        if (imagePart) {
            addLog("4K image received! Length: " + imagePart.data.length);
            addLog("Placing into Photoshop...");
            await placeBase64("data:" + (imagePart.mimeType || "image/png") + ";base64," + imagePart.data);
            addLog("DONE!");
            setStatus("Upscale 4K thành công!");
            addCost('image', 1);
            addCost('textInput', 1000);
        } else {
            addLog("No image in response");
            addLog("Response: " + JSON.stringify(data).substring(0, 200));
            throw new Error("No 4K image returned");
        }
    } catch (e) {
        addLog("Error: " + e.message);
        setStatus("Lỗi upscale");
        alert(e.message);
    } finally {
        setLoading(false);
    }
}

// === FACE SWAP FUNCTIONS ===
async function handleCaptureFaceTarget() {
    try {
        setLoading(true);
        setStatus("Đang chụp ảnh mục tiêu...");
        addLog("=== CAPTURE FACE TARGET ===");

        var b64 = await getLayerAsBase64();
        setFaceTargetImage(b64);
        addLog("Face target captured: " + b64.length + " chars");
        setStatus("Đã chụp ảnh mục tiêu!");
    } catch (e) {
        addLog("Error: " + e.message);
        setStatus("Lỗi chụp ảnh mục tiêu");
        alert(e.message);
    } finally {
        setLoading(false);
    }
}

async function handleUploadFaceReference() {
    try {
        setLoading(true);
        setStatus("Đang mở file browser...");
        addLog("=== UPLOAD FACE REFERENCE ===");

        // Use UXP file system to pick file
        const uxpfs = require('uxp').storage;
        const fs = uxpfs.localFileSystem;

        const file = await fs.getFileForOpening({
            types: ['jpg', 'jpeg', 'png', 'gif', 'webp']
        });

        if (!file) {
            addLog("File selection cancelled");
            setStatus("Đã hủy chọn file");
            setLoading(false);
            return;
        }

        addLog("File selected: " + file.name);
        setStatus("Đang đọc file...");

        // Read file as array buffer
        const arrayBuffer = await file.read({ format: uxpfs.formats.binary });

        // Convert to base64
        const uint8Array = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
        }
        const base64 = btoa(binary);

        setFaceReferenceImage(base64);
        addLog("Face reference loaded: " + base64.length + " chars");
        setStatus("Đã upload khuôn mặt mẫu!");
    } catch (e) {
        addLog("Error: " + e.message);
        setStatus("Lỗi upload file");
        alert(e.message);
    } finally {
        setLoading(false);
    }
}

async function handleFaceSwap() {
    var cleanKey = key.trim();
    if (!cleanKey) { alert("Vui lòng nhập API Key trước!"); return; }
    if (!faceReferenceImage) { alert("Vui lòng chụp khuôn mặt tham chiếu!"); return; }
    if (!faceTargetImage) { alert("Vui lòng chụp ảnh mục tiêu!"); return; }

    setLoading(true);
    addLog("=== FACE SWAP ===");

    try {
        setStatus("Đang thay thế khuôn mặt...");
        addLog("Sending to Gemini for face swap...");

        var prompt = `You are a professional face replacement AI. Your task is to replace the face in the TARGET IMAGE with the face from the REFERENCE IMAGE.

CRITICAL REQUIREMENTS:
1. The face in the output MUST be EXACTLY identical to the REFERENCE face - same facial features, eyes, nose, mouth, skin tone, facial structure
2. Keep the original pose, angle, and body position from the TARGET image
3. Match the lighting and shadows naturally to blend the new face
4. Preserve the hairstyle from the TARGET image OR blend naturally with the reference if needed
5. The result must look completely natural and realistic, as if the person was actually photographed in that scene
6. Do NOT change anything else in the image except the face
7. Maintain the exact same image composition, background, and all other elements

IMAGE 1 (REFERENCE FACE): This is the face that should appear in the final image. Copy this face EXACTLY.
IMAGE 2 (TARGET IMAGE): This is the scene where the face should be replaced.

Generate the final image with the face swap completed.`;

        var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=' + cleanKey, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType: "image/jpeg",
                                data: faceReferenceImage
                            }
                        },
                        {
                            inlineData: {
                                mimeType: "image/jpeg",
                                data: faceTargetImage
                            }
                        }
                    ]
                }],
                generationConfig: {
                    responseModalities: ["TEXT", "IMAGE"],
                    imageConfig: {
                        imageSize: "4K"
                    }
                }
            })
        });

        addLog("HTTP: " + res.status);

        if (!res.ok) {
            var errText = await res.text();
            addLog("Error: " + errText.substring(0, 150));
            throw new Error("API failed: " + res.status);
        }

        var data = await res.json();
        addLog("Got response");

        var imagePart = null;
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
            for (var i = 0; i < data.candidates[0].content.parts.length; i++) {
                var part = data.candidates[0].content.parts[i];
                if (part.inlineData && part.inlineData.data) {
                    imagePart = part.inlineData;
                    break;
                }
            }
        }

        if (imagePart) {
            addLog("Face swap done! Length: " + imagePart.data.length);
            await placeBase64("data:" + (imagePart.mimeType || "image/png") + ";base64," + imagePart.data);
            addLog("DONE!");
            setStatus("Thay thế khuôn mặt thành công!");
            addCost('image', 1);
            addCost('textInput', 2000);
        } else {
            addLog("No image in response");
            throw new Error("No face swap image returned");
        }
    } catch (e) {
        addLog("Error: " + e.message);
        setStatus("Lỗi thay thế khuôn mặt");
        alert(e.message);
    } finally {
        setLoading(false);
    }
}

// === AUTO BATCH FUNCTIONS ===

async function handleBatchSelectInputFolder() {
    try {
        addLog("=== SELECT INPUT FOLDER ===");
        const uxpfs = require('uxp').storage;
        const lfs = uxpfs.localFileSystem;

        const folder = await lfs.getFolder();
        if (!folder) {
            addLog("Folder selection cancelled");
            return;
        }

        addLog("Folder selected: " + folder.name);
        setBatchInputFolder(folder);
        setBatchInputFolderName(folder.name);

        // List image files in folder
        const entries = await folder.getEntries();
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        const imageFiles = entries.filter(function (entry) {
            if (entry.isFolder) return false;
            var ext = entry.name.split('.').pop().toLowerCase();
            return imageExtensions.indexOf(ext) >= 0;
        });

        setBatchInputFiles(imageFiles);
        addLog("Found " + imageFiles.length + " images in folder");
        setStatus("Đã chọn " + imageFiles.length + " ảnh");
    } catch (e) {
        addLog("Error selecting folder: " + e.message);
        setStatus("Lỗi chọn thư mục");
    }
}

async function handleBatchSelectOutputFolder() {
    try {
        addLog("=== SELECT OUTPUT FOLDER ===");
        const uxpfs = require('uxp').storage;
        const lfs = uxpfs.localFileSystem;

        const folder = await lfs.getFolder();
        if (!folder) {
            addLog("Output folder selection cancelled");
            return;
        }

        setBatchOutputFolder(folder);
        setBatchOutputFolderName(folder.name);
        addLog("Output folder: " + folder.name);
    } catch (e) {
        addLog("Error selecting output folder: " + e.message);
    }
}

async function handleBatchBackgroundUpload() {
    try {
        addLog("=== SELECT BATCH BACKGROUND ===");
        const uxpfs = require('uxp').storage;
        const lfs = uxpfs.localFileSystem;

        const file = await lfs.getFileForOpening({
            types: ['jpg', 'jpeg', 'png', 'gif', 'webp']
        });

        if (!file) {
            addLog("Background selection cancelled");
            return;
        }

        addLog("Loading background: " + file.name);
        const b64 = await readFileAsBase64(file);
        setBatchBackgroundImage(b64);
        addLog("Background loaded: " + b64.length + " chars");
    } catch (e) {
        addLog("Error loading background: " + e.message);
    }
}

async function handleBatchProcess() {
    if (batchInputFiles.length === 0) { alert("Chưa chọn thư mục ảnh!"); return; }
    if (!batchOutputFolder) { alert("Chưa chọn thư mục xuất!"); return; }
    if (batchMode === 'composite' && !batchBackgroundImage) { alert("Chưa chọn background!"); return; }
    if (batchMode === 'template' && !batchSelectedTemplate) { alert("Chưa chọn template!"); return; }

    var cleanKey = key.trim();
    if (!cleanKey) { alert("Vui lòng nhập API Key!"); return; }

    setLoading(true);
    setBatchProgress({ current: 0, total: batchInputFiles.length, running: true });
    setBatchResults([]);
    addLog("=== AUTO BATCH START ===");
    addLog("Mode: " + batchMode);
    addLog("Total files: " + batchInputFiles.length);

    var results = [];

    for (var fileIdx = 0; fileIdx < batchInputFiles.length; fileIdx++) {
        var currentFile = batchInputFiles[fileIdx];
        var baseName = currentFile.name.replace(/\.[^/.]+$/, "");

        setBatchProgress({ current: fileIdx + 1, total: batchInputFiles.length, running: true });
        addLog("--- Processing [" + (fileIdx + 1) + "/" + batchInputFiles.length + "]: " + currentFile.name + " ---");
        setStatus("Đang xử lý " + (fileIdx + 1) + "/" + batchInputFiles.length + ": " + currentFile.name);

        try {
            // Read subject image
            var subjectB64 = await readFileAsBase64(currentFile);
            addLog("Read subject: " + subjectB64.length + " chars");

            // Build API request based on mode
            var requestBody;

            if (batchMode === 'composite') {
                var compBasePrompt = "Composite the subject onto this background.";
                var compOptionPrompts = [];

                if (batchOptKeepFace) {
                    compOptionPrompts.push("IMPORTANT: Keep the subject's face exactly the same, do not modify facial features, expression, or identity.");
                }
                if (batchOptKeepPose) {
                    compOptionPrompts.push("Maintain the exact same body pose and positioning of the subject.");
                }
                if (batchOptMatchLight) {
                    compOptionPrompts.push("Match the lighting, color temperature, and shadows to blend naturally with the background.");
                }
                compOptionPrompts.push("Make it look photorealistic and natural.");

                if (batchPrompt) {
                    compOptionPrompts.push("Additional instructions: " + batchPrompt);
                }

                var compPrompt = compBasePrompt + " " + compOptionPrompts.join(" ");

                requestBody = {
                    contents: [{
                        parts: [
                            { text: "BACKGROUND IMAGE:" },
                            { inlineData: { mimeType: "image/jpeg", data: batchBackgroundImage } },
                            { text: "SUBJECT TO COMPOSITE:" },
                            { inlineData: { mimeType: "image/jpeg", data: subjectB64 } },
                            { text: "INSTRUCTION: " + compPrompt }
                        ]
                    }],
                    generationConfig: {
                        responseModalities: ["TEXT", "IMAGE"],
                        imageConfig: {
                            imageSize: "4K",
                            aspectRatio: batchAspectRatio
                        }
                    }
                };
            } else {
                // Template mode
                var template = TEMPLATES.find(function (t) { return t.id === batchSelectedTemplate; });
                if (!template) { throw new Error("Template không tìm thấy"); }

                var templateOptions = template.options || { keepFace: true, keepPose: true, matchLight: true };
                var tplBasePrompt = "Generate a background image based on this description: " + template.prompt + ". Then composite the provided subject(s) onto this generated background.";
                var tplOptionPrompts = [];

                if (templateOptions.keepFace) {
                    tplOptionPrompts.push("CRITICAL: Keep all faces exactly the same, do not modify facial features, expression, or identity.");
                }
                if (templateOptions.keepPose) {
                    tplOptionPrompts.push("Maintain the exact same body poses and positioning of all subjects.");
                }
                if (templateOptions.matchLight) {
                    tplOptionPrompts.push("Match the lighting, color temperature, and shadows to blend naturally with the background.");
                }
                tplOptionPrompts.push("Make it look photorealistic and natural.");
                tplOptionPrompts.push("Output high quality 4K image.");

                var tplPrompt = tplBasePrompt + " " + tplOptionPrompts.join(" ");

                requestBody = {
                    contents: [{
                        parts: [
                            { text: "SUBJECT(S) TO COMPOSITE:" },
                            { inlineData: { mimeType: "image/jpeg", data: subjectB64 } },
                            { text: "INSTRUCTION: " + tplPrompt }
                        ]
                    }],
                    generationConfig: {
                        responseModalities: ["TEXT", "IMAGE"],
                        imageConfig: {
                            imageSize: "4K",
                            aspectRatio: batchAspectRatio
                        }
                    }
                };
            }

            // Call API
            addLog("Calling Gemini API...");
            var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=' + cleanKey, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            addLog("HTTP: " + res.status);

            if (!res.ok) {
                var errText = await res.text();
                throw new Error("API failed: " + res.status + " - " + errText.substring(0, 100));
            }

            var data = await res.json();

            // Find image part
            var imagePart = null;
            if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
                for (var pi = 0; pi < data.candidates[0].content.parts.length; pi++) {
                    var part = data.candidates[0].content.parts[pi];
                    if (part.inlineData && part.inlineData.data) {
                        imagePart = part.inlineData;
                        break;
                    }
                }
            }

            if (imagePart) {
                // Save to output folder
                var outputFileName = baseName + "_batch" + (imagePart.mimeType === "image/jpeg" ? ".jpg" : ".png");
                var fullB64 = "data:" + (imagePart.mimeType || "image/png") + ";base64," + imagePart.data;
                await saveBase64ToFile(fullB64, batchOutputFolder, outputFileName);

                addLog("✓ Saved: " + outputFileName);
                results.push({ fileName: currentFile.name, status: 'success', message: 'OK → ' + outputFileName });
                addCost('image', 1);
                addCost('textInput', 2000);
            } else {
                throw new Error("No image returned from API");
            }

        } catch (e) {
            addLog("✗ Error: " + currentFile.name + " - " + e.message);
            results.push({ fileName: currentFile.name, status: 'error', message: e.message });
        }

        setBatchResults([].concat(results));
    }

    var successCount = results.filter(function (r) { return r.status === 'success'; }).length;
    var errorCount = results.filter(function (r) { return r.status === 'error'; }).length;

    setBatchProgress({ current: batchInputFiles.length, total: batchInputFiles.length, running: false });
    addLog("=== BATCH COMPLETE ===");
    addLog("Success: " + successCount + " / Error: " + errorCount + " / Total: " + results.length);
    setStatus("Batch xong! " + successCount + " thành công, " + errorCount + " lỗi");
    setLoading(false);
}

return React.createElement('div', { style: { padding: 12, color: 'white', background: '#1a1a1a', height: '100vh', boxSizing: 'border-box', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column' } },
    React.createElement('h3', { style: { margin: '0 0 10px', fontSize: 14, borderBottom: '1px solid #333', paddingBottom: 8 } }, 'Gemini AI Studio V2'),

    // API Key
    React.createElement('div', { style: { marginBottom: 10 } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 3 } },
            React.createElement('label', { style: { fontSize: 9, color: '#888' } }, 'API KEY'),
            keyValid === true && React.createElement('span', { style: { fontSize: 9, color: '#0f0' } }, '✓ OK'),
            keyValid === false && React.createElement('span', { style: { fontSize: 9, color: '#f00' } }, '✗ LỖI')
        ),
        React.createElement('div', { style: { display: 'flex', gap: 4 } },
            React.createElement('input', {
                type: 'password',
                placeholder: 'Dán API Key...',
                value: key,
                onChange: function (e) { setKey(e.target.value); setKeyValid(null); },
                style: { flex: 1, padding: 6, background: '#333', border: '1px solid #444', color: 'white', fontSize: 11 }
            }),
            React.createElement('button', {
                onClick: handleVerifyKey,
                disabled: loading || !key,
                style: { padding: '6px 10px', background: '#444', color: 'white', border: 'none', fontSize: 10 }
            }, 'Verify')
        )
    ),

    // Tab Navigation
    React.createElement('div', { style: { display: 'flex', marginBottom: 10, borderBottom: '1px solid #444' } },
        React.createElement('button', {
            onClick: function () { setActiveTab('edit'); },
            style: {
                flex: 1, padding: 8, border: 'none', fontSize: 9, fontWeight: 'bold',
                background: activeTab === 'edit' ? '#0078D7' : '#333',
                color: activeTab === 'edit' ? 'white' : '#888',
                borderBottom: activeTab === 'edit' ? '2px solid #0078D7' : 'none'
            }
        }, '✏️ Sửa'),
        React.createElement('button', {
            onClick: function () { setActiveTab('composite'); },
            style: {
                flex: 1, padding: 8, border: 'none', fontSize: 9, fontWeight: 'bold',
                background: activeTab === 'composite' ? '#28a745' : '#333',
                color: activeTab === 'composite' ? 'white' : '#888',
                borderBottom: activeTab === 'composite' ? '2px solid #28a745' : 'none'
            }
        }, '🖼️ Ghép'),
        React.createElement('button', {
            onClick: function () { setActiveTab('template'); },
            style: {
                flex: 1, padding: 8, border: 'none', fontSize: 9, fontWeight: 'bold',
                background: activeTab === 'template' ? '#9c27b0' : '#333',
                color: activeTab === 'template' ? 'white' : '#888',
                borderBottom: activeTab === 'template' ? '2px solid #9c27b0' : 'none'
            }
        }, '🎨 Template'),
        React.createElement('button', {
            onClick: function () { setActiveTab('upscale'); },
            style: {
                flex: 1, padding: 8, border: 'none', fontSize: 9, fontWeight: 'bold',
                background: activeTab === 'upscale' ? '#ff5722' : '#333',
                color: activeTab === 'upscale' ? 'white' : '#888',
                borderBottom: activeTab === 'upscale' ? '2px solid #ff5722' : 'none'
            }
        }, '🔍 4K'),
        React.createElement('button', {
            onClick: function () { setActiveTab('faceswap'); },
            style: {
                flex: 1, padding: 8, border: 'none', fontSize: 9, fontWeight: 'bold',
                background: activeTab === 'faceswap' ? '#e91e63' : '#333',
                color: activeTab === 'faceswap' ? 'white' : '#888',
                borderBottom: activeTab === 'faceswap' ? '2px solid #e91e63' : 'none'
            }
        }, '👤 Face'),
        React.createElement('button', {
            onClick: function () { setActiveTab('batch'); },
            style: {
                flex: 1, padding: 8, border: 'none', fontSize: 9, fontWeight: 'bold',
                background: activeTab === 'batch' ? '#00897b' : '#333',
                color: activeTab === 'batch' ? 'white' : '#888',
                borderBottom: activeTab === 'batch' ? '2px solid #00897b' : 'none'
            }
        }, '📦 Batch')
    ),

    // === EDIT TAB ===
    activeTab === 'edit' && React.createElement('div', null,
        // Prompt
        React.createElement('div', { style: { marginBottom: 10 } },
            React.createElement('label', { style: { fontSize: 9, color: '#888', display: 'block', marginBottom: 3 } }, 'YÊU CẦU'),
            React.createElement('textarea', {
                placeholder: 'Ví dụ: đổi màu áo...',
                value: userPrompt,
                onChange: function (e) { setUserPrompt(e.target.value); },
                style: { width: '100%', height: 50, padding: 6, background: '#333', border: '1px solid #444', color: 'white', fontSize: 11, resize: 'none', boxSizing: 'border-box' }
            })
        ),

        // Aspect Ratio Selection for Edit
        React.createElement('div', { style: { marginBottom: 10 } },
            React.createElement('label', { style: { fontSize: 9, color: '#888', display: 'block', marginBottom: 3 } }, '📐 TỈ LỆ ẢNH'),
            React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
                ASPECT_RATIOS.map(function (ratio) {
                    return React.createElement('button', {
                        key: ratio.id,
                        onClick: function () { setEditAspectRatio(ratio.value); },
                        style: {
                            padding: '4px 8px',
                            background: editAspectRatio === ratio.value ? '#0078D7' : '#333',
                            color: editAspectRatio === ratio.value ? 'white' : '#ccc',
                            border: editAspectRatio === ratio.value ? '2px solid #4da6ff' : '1px solid #444',
                            borderRadius: 4,
                            fontSize: 9,
                            cursor: 'pointer'
                        }
                    }, ratio.label);
                })
            )
        ),

        // Step 1 Button
        React.createElement('button', {
            onClick: handleRefinePrompt,
            disabled: loading || !key,
            style: { width: '100%', padding: 10, background: '#0078D7', color: 'white', border: 'none', fontWeight: 'bold', marginBottom: 10, fontSize: 11 }
        }, 'Bước 1: Phân tích'),

        // Refined Prompt
        refinedPrompt && React.createElement('div', { style: { padding: 8, background: '#111', borderLeft: '2px solid #0078D7', marginBottom: 10, fontSize: 10 } },
            React.createElement('div', { style: { color: '#0078D7', marginBottom: 4, fontWeight: 'bold' } }, 'PROMPT AI:'),
            React.createElement('div', { style: { color: '#ccc', lineHeight: 1.4 } }, refinedPrompt.substring(0, 200) + '...'),
            React.createElement('button', {
                onClick: handleGenerateAndPlace,
                disabled: loading,
                style: { width: '100%', padding: 10, background: '#28a745', color: 'white', border: 'none', fontWeight: 'bold', marginTop: 8, fontSize: 11 }
            }, 'Bước 2: Tạo & Chèn')
        ),

        // Debug Log
        React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', borderTop: '1px solid #333', paddingTop: 8, overflow: 'hidden' } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 } },
                React.createElement('span', { style: { fontSize: 9, color: '#888' } }, 'DEBUG LOG'),
                React.createElement('span', { style: { fontSize: 9, color: '#0078D7', cursor: 'pointer' }, onClick: function () { setLogs([]); } }, 'Xóa')
            ),
            React.createElement('div', { style: { flex: 1, background: '#000', padding: 6, fontSize: 9, color: '#0f0', fontFamily: 'monospace', overflowY: 'auto', border: '1px solid #333', maxHeight: 120 } },
                logs.length === 0 ? 'Chưa có log...' : logs.map(function (l, i) { return React.createElement('div', { key: i, style: { marginBottom: 2 } }, l); })
            )
        ),

        // Cost Panel (Collapsible)
        React.createElement('div', { style: { borderTop: '1px solid #333', marginTop: 8, paddingTop: 8 } },
            React.createElement('div', {
                style: { display: 'flex', justifyContent: 'space-between', cursor: 'pointer', marginBottom: showCost ? 6 : 0 },
                onClick: function () { setShowCost(!showCost); }
            },
                React.createElement('span', { style: { fontSize: 9, color: '#888' } }, '💰 CHI PHÍ ' + (showCost ? '▼' : '▶')),
                React.createElement('span', { style: { fontSize: 10, color: '#FFD700', fontWeight: 'bold' } }, '$' + getTotalCost().toFixed(4))
            ),
            showCost && React.createElement('div', { style: { background: '#111', padding: 8, fontSize: 9, border: '1px solid #333' } },
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 } },
                    React.createElement('span', { style: { color: '#888' } }, 'Text Input:'),
                    React.createElement('span', { style: { color: '#ccc' } }, costs.textInputTokens.toLocaleString() + ' tokens ($' + (costs.textInputTokens * PRICING.textInput).toFixed(4) + ')')
                ),
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 } },
                    React.createElement('span', { style: { color: '#888' } }, 'Text Output:'),
                    React.createElement('span', { style: { color: '#ccc' } }, costs.textOutputTokens.toLocaleString() + ' tokens ($' + (costs.textOutputTokens * PRICING.textOutput).toFixed(4) + ')')
                ),
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 } },
                    React.createElement('span', { style: { color: '#888' } }, 'Images (4K):'),
                    React.createElement('span', { style: { color: '#ccc' } }, costs.imageCount + ' ảnh ($' + (costs.imageCount * PRICING.image).toFixed(4) + ')')
                ),
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 6, borderTop: '1px solid #333', paddingTop: 4 } },
                    React.createElement('span', { style: { color: '#FFD700', fontWeight: 'bold' } }, 'TỔNG:'),
                    React.createElement('span', { style: { color: '#FFD700', fontWeight: 'bold' } }, '$' + getTotalCost().toFixed(4))
                ),
                React.createElement('div', { style: { display: 'flex', gap: 4 } },
                    React.createElement('span', { style: { fontSize: 8, color: '#666' } }, 'Sessions: ' + costs.sessions),
                    React.createElement('span', {
                        style: { fontSize: 8, color: '#0078D7', cursor: 'pointer', marginLeft: 'auto' },
                        onClick: function (e) { e.stopPropagation(); resetCosts(); }
                    }, 'Reset')
                )
            )
        ),

        // Status
        React.createElement('div', { style: { textAlign: 'center', paddingTop: 8, fontSize: 10, color: status.indexOf('Lỗi') >= 0 ? '#f00' : '#888' } }, status)
    ),  // End Edit Tab

    // === COMPOSITE TAB ===
    activeTab === 'composite' && React.createElement('div', null,
        // Subject capture
        React.createElement('div', { style: { marginBottom: 10 } },
            React.createElement('label', { style: { fontSize: 9, color: '#888', display: 'block', marginBottom: 3 } }, 'SUBJECT (Layer hiện tại)'),
            React.createElement('div', { style: { display: 'flex', gap: 4, alignItems: 'center' } },
                React.createElement('button', {
                    onClick: handleCaptureSubject,
                    disabled: loading,
                    style: { flex: 1, padding: 8, background: '#0078D7', color: 'white', border: 'none', fontSize: 10 }
                }, '📷 Chụp Subject'),
                subjectImage && React.createElement('span', { style: { fontSize: 9, color: '#0f0' } }, '✓')
            )
        ),

        // Background upload
        React.createElement('div', { style: { marginBottom: 10 } },
            React.createElement('label', { style: { fontSize: 9, color: '#888', display: 'block', marginBottom: 3 } }, 'BACKGROUND'),
            React.createElement('div', { style: { display: 'flex', gap: 4, alignItems: 'center' } },
                React.createElement('button', {
                    onClick: handleBackgroundUpload,
                    disabled: loading,
                    style: { flex: 1, padding: 8, background: '#6c5ce7', color: 'white', border: 'none', fontSize: 10 }
                }, '📂 Chọn Background'),
                backgroundImage && React.createElement('span', { style: { fontSize: 9, color: '#0f0' } }, '✓')
            ),
            backgroundImage && React.createElement('div', { style: { marginTop: 4, fontSize: 9, color: '#0f0' } }, '✓ Background loaded')
        ),

        // Composite prompt
        React.createElement('div', { style: { marginBottom: 10 } },
            React.createElement('label', { style: { fontSize: 9, color: '#888', display: 'block', marginBottom: 3 } }, 'TÙY CHỈNH (tùy chọn)'),
            React.createElement('textarea', {
                placeholder: 'Ví dụ: Add soft shadows, warm color tone...',
                value: compositePrompt,
                onChange: function (e) { setCompositePrompt(e.target.value); },
                style: { width: '100%', height: 35, padding: 6, background: '#333', border: '1px solid #444', color: 'white', fontSize: 10, resize: 'none', boxSizing: 'border-box' }
            })
        ),

        // Composite Options (Checkboxes)
        React.createElement('div', { style: { marginBottom: 10, background: '#222', padding: 8, border: '1px solid #333' } },
            React.createElement('label', { style: { fontSize: 9, color: '#888', display: 'block', marginBottom: 6 } }, 'TÙY CHỌN'),

            // Keep Face checkbox
            React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, cursor: 'pointer', fontSize: 10, color: '#ccc' } },
                React.createElement('input', {
                    type: 'checkbox',
                    checked: optKeepFace,
                    onChange: function (e) { setOptKeepFace(e.target.checked); },
                    style: { width: 14, height: 14 }
                }),
                '🎭 Không thay đổi khuôn mặt'
            ),

            // Keep Pose checkbox
            React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, cursor: 'pointer', fontSize: 10, color: '#ccc' } },
                React.createElement('input', {
                    type: 'checkbox',
                    checked: optKeepPose,
                    onChange: function (e) { setOptKeepPose(e.target.checked); },
                    style: { width: 14, height: 14 }
                }),
                '🧍 Không thay đổi tư thế'
            ),

            // Match Lighting checkbox
            React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 10, color: '#ccc' } },
                React.createElement('input', {
                    type: 'checkbox',
                    checked: optMatchLight,
                    onChange: function (e) { setOptMatchLight(e.target.checked); },
                    style: { width: 14, height: 14 }
                }),
                '💡 Matching ánh sáng'
            )
        ),

        // Aspect Ratio Selection for Composite
        React.createElement('div', { style: { marginBottom: 10 } },
            React.createElement('label', { style: { fontSize: 9, color: '#888', display: 'block', marginBottom: 3 } }, '📐 TỈ LỆ ẢNH'),
            React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
                ASPECT_RATIOS.map(function (ratio) {
                    return React.createElement('button', {
                        key: ratio.id,
                        onClick: function () { setCompositeAspectRatio(ratio.value); },
                        style: {
                            padding: '4px 8px',
                            background: compositeAspectRatio === ratio.value ? '#28a745' : '#333',
                            color: compositeAspectRatio === ratio.value ? 'white' : '#ccc',
                            border: compositeAspectRatio === ratio.value ? '2px solid #34ce57' : '1px solid #444',
                            borderRadius: 4,
                            fontSize: 9,
                            cursor: 'pointer'
                        }
                    }, ratio.label);
                })
            )
        ),

        // Composite button
        React.createElement('button', {
            onClick: handleComposite,
            disabled: loading || !subjectImage || !backgroundImage,
            style: {
                width: '100%', padding: 12,
                background: (!subjectImage || !backgroundImage) ? '#555' : '#28a745',
                color: 'white', border: 'none', fontWeight: 'bold', marginBottom: 10, fontSize: 11
            }
        }, '🎨 Ghép & Match'),

        // Debug Log for composite
        React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', borderTop: '1px solid #333', paddingTop: 8 } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 } },
                React.createElement('span', { style: { fontSize: 9, color: '#888' } }, 'DEBUG LOG'),
                React.createElement('span', { style: { fontSize: 9, color: '#0078D7', cursor: 'pointer' }, onClick: function () { setLogs([]); } }, 'Xóa')
            ),
            React.createElement('div', { style: { background: '#000', padding: 6, fontSize: 9, color: '#0f0', fontFamily: 'monospace', overflowY: 'auto', border: '1px solid #333', maxHeight: 100 } },
                logs.length === 0 ? 'Chưa có log...' : logs.map(function (l, i) { return React.createElement('div', { key: i, style: { marginBottom: 2 } }, l); })
            )
        ),

        // Cost summary
        React.createElement('div', { style: { textAlign: 'center', paddingTop: 8, fontSize: 10, color: '#FFD700' } },
            '💰 Chi phí: $' + getTotalCost().toFixed(4)
        ),

        // Status
        React.createElement('div', { style: { textAlign: 'center', paddingTop: 4, fontSize: 10, color: status.indexOf('Lỗi') >= 0 ? '#f00' : '#888' } }, status)
    ),

    // === TEMPLATE TAB ===
    activeTab === 'template' && React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } },

        // Step 1: Capture Subject
        React.createElement('div', { style: { marginBottom: 10 } },
            React.createElement('div', { style: { fontSize: 10, fontWeight: 'bold', marginBottom: 6, color: '#9c27b0' } }, '📷 Bước 1: Chụp Subject'),
            React.createElement('button', {
                onClick: handleCaptureTemplateSubject,
                disabled: loading,
                style: {
                    width: '100%', padding: 10, background: templateSubjectImage ? '#4a148c' : '#9c27b0',
                    color: 'white', border: 'none', fontSize: 10, fontWeight: 'bold'
                }
            }, templateSubjectImage ? '✅ Đã chụp Subject' : '📸 Chụp Subject từ Layer')
        ),

        // Step 2: Choose Template
        React.createElement('div', { style: { marginBottom: 10, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' } },
            React.createElement('div', { style: { fontSize: 10, fontWeight: 'bold', marginBottom: 6, color: '#9c27b0' } }, '🎨 Bước 2: Chọn Template'),

            // Template categories
            React.createElement('div', { style: { flex: 1, overflowY: 'auto', background: '#222', borderRadius: 4, padding: 8 } },

                // Baby Templates - Tết
                React.createElement('div', { style: { marginBottom: 12 } },
                    React.createElement('div', { style: { fontSize: 9, fontWeight: 'bold', marginBottom: 8, color: '#ff9800', borderBottom: '1px solid #444', paddingBottom: 4 } }, '🧒 TẾT CHO BÉ YÊU 2026'),
                    React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
                        TEMPLATES.filter(function (t) { return t.category === 'baby'; }).map(function (template) {
                            var isSelected = selectedTemplate === template.id;
                            return React.createElement('div', {
                                key: template.id,
                                onClick: function () { setSelectedTemplate(template.id); },
                                style: {
                                    width: '48%',
                                    cursor: 'pointer',
                                    borderRadius: 6,
                                    border: isSelected ? '2px solid #ba68c8' : '1px solid #444',
                                    overflow: 'hidden',
                                    boxShadow: isSelected ? '0 0 8px rgba(156, 39, 176, 0.5)' : 'none',
                                    transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                                    transition: 'all 0.2s ease'
                                }
                            },
                                // Thumbnail with icon
                                React.createElement('div', {
                                    style: {
                                        background: template.bgColor,
                                        height: 50,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 28
                                    }
                                }, template.icon),
                                // Template name
                                React.createElement('div', {
                                    style: {
                                        background: isSelected ? '#9c27b0' : '#333',
                                        color: 'white',
                                        padding: '4px 6px',
                                        fontSize: 8,
                                        textAlign: 'center',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }
                                }, template.name)
                            );
                        })
                    )
                ),

                // Family Templates - Tết
                React.createElement('div', null,
                    React.createElement('div', { style: { fontSize: 9, fontWeight: 'bold', marginBottom: 8, color: '#4caf50', borderBottom: '1px solid #444', paddingBottom: 4 } }, '👨‍👩‍👧‍👦 TẾT GIA ĐÌNH SUM HỌP 2026'),
                    React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
                        TEMPLATES.filter(function (t) { return t.category === 'family'; }).map(function (template) {
                            var isSelected = selectedTemplate === template.id;
                            return React.createElement('div', {
                                key: template.id,
                                onClick: function () { setSelectedTemplate(template.id); },
                                style: {
                                    width: '48%',
                                    cursor: 'pointer',
                                    borderRadius: 6,
                                    border: isSelected ? '2px solid #ba68c8' : '1px solid #444',
                                    overflow: 'hidden',
                                    boxShadow: isSelected ? '0 0 8px rgba(156, 39, 176, 0.5)' : 'none',
                                    transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                                    transition: 'all 0.2s ease'
                                }
                            },
                                // Thumbnail with icon
                                React.createElement('div', {
                                    style: {
                                        background: template.bgColor,
                                        height: 50,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 28
                                    }
                                }, template.icon),
                                // Template name
                                React.createElement('div', {
                                    style: {
                                        background: isSelected ? '#9c27b0' : '#333',
                                        color: 'white',
                                        padding: '4px 6px',
                                        fontSize: 8,
                                        textAlign: 'center',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }
                                }, template.name)
                            );
                        })
                    )
                )
            )
        ),

        // Selected template info with preset options
        selectedTemplate && (function () {
            var t = TEMPLATES.find(function (t) { return t.id === selectedTemplate; });
            var opts = t.options || { keepFace: true, keepPose: true, matchLight: true };
            return React.createElement('div', { style: { marginBottom: 10, borderRadius: 6, overflow: 'hidden', border: '1px solid #6a3ab0' } },
                // Header with icon and gradient
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: t.bgColor } },
                    React.createElement('span', { style: { fontSize: 24 } }, t.icon),
                    React.createElement('div', null,
                        React.createElement('div', { style: { fontWeight: 'bold', fontSize: 10, color: 'white', textShadow: '0 1px 2px rgba(0,0,0,0.5)' } }, t.name),
                        React.createElement('div', { style: { fontSize: 8, color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 2px rgba(0,0,0,0.5)' } }, t.description)
                    )
                ),
                // Preset options
                React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4, padding: 6, background: '#2a1540' } },
                    React.createElement('span', { style: { fontSize: 8, color: '#ba68c8', marginRight: 4 } }, 'Tùy chọn:'),
                    React.createElement('span', { style: { fontSize: 8, padding: '2px 4px', borderRadius: 3, background: opts.keepFace ? '#4caf50' : '#666', color: 'white' } }, opts.keepFace ? '✓ Giữ mặt' : '✗ Mặt'),
                    React.createElement('span', { style: { fontSize: 8, padding: '2px 4px', borderRadius: 3, background: opts.keepPose ? '#4caf50' : '#666', color: 'white' } }, opts.keepPose ? '✓ Giữ tư thế' : '✗ Tư thế'),
                    React.createElement('span', { style: { fontSize: 8, padding: '2px 4px', borderRadius: 3, background: opts.matchLight ? '#4caf50' : '#666', color: 'white' } }, opts.matchLight ? '✓ Ánh sáng' : '✗ Ánh sáng')
                )
            );
        })(),

        // Aspect Ratio Selection for Template
        React.createElement('div', { style: { marginBottom: 10 } },
            React.createElement('label', { style: { fontSize: 9, color: '#888', display: 'block', marginBottom: 3 } }, '📐 TỈ LỆ ẢNH'),
            React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
                ASPECT_RATIOS.map(function (ratio) {
                    return React.createElement('button', {
                        key: ratio.id,
                        onClick: function () { setTemplateAspectRatio(ratio.value); },
                        style: {
                            padding: '4px 8px',
                            background: templateAspectRatio === ratio.value ? '#9c27b0' : '#333',
                            color: templateAspectRatio === ratio.value ? 'white' : '#ccc',
                            border: templateAspectRatio === ratio.value ? '2px solid #ba68c8' : '1px solid #444',
                            borderRadius: 4,
                            fontSize: 9,
                            cursor: 'pointer'
                        }
                    }, ratio.label);
                })
            )
        ),

        // Step 3: Generate
        React.createElement('button', {
            onClick: handleTemplateComposite,
            disabled: loading || !templateSubjectImage || !selectedTemplate,
            style: {
                width: '100%', padding: 12,
                background: (!templateSubjectImage || !selectedTemplate) ? '#555' : '#9c27b0',
                color: 'white', border: 'none', fontWeight: 'bold', marginBottom: 10, fontSize: 11
            }
        }, loading ? '⏳ Đang xử lý...' : '🎨 Ghép Template'),

        // Debug Log
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', borderTop: '1px solid #333', paddingTop: 8 } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 } },
                React.createElement('span', { style: { fontSize: 9, color: '#888' } }, 'DEBUG LOG'),
                React.createElement('span', { style: { fontSize: 9, color: '#9c27b0', cursor: 'pointer' }, onClick: function () { setLogs([]); } }, 'Xóa')
            ),
            React.createElement('div', { style: { background: '#000', padding: 6, fontSize: 9, color: '#0f0', fontFamily: 'monospace', overflowY: 'auto', border: '1px solid #333', maxHeight: 80 } },
                logs.length === 0 ? 'Chưa có log...' : logs.map(function (l, i) { return React.createElement('div', { key: i, style: { marginBottom: 2 } }, l); })
            )
        ),

        // Cost summary
        React.createElement('div', { style: { textAlign: 'center', paddingTop: 8, fontSize: 10, color: '#FFD700' } },
            '💰 Chi phí: $' + getTotalCost().toFixed(4)
        ),

        // Status
        React.createElement('div', { style: { textAlign: 'center', paddingTop: 4, fontSize: 10, color: status.indexOf('Lỗi') >= 0 ? '#f00' : '#888' } }, status)
    ),

    // === UPSCALE 4K TAB ===
    activeTab === 'upscale' && React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column' } },

        // Header
        React.createElement('div', { style: { textAlign: 'center', marginBottom: 16, padding: 12, background: 'linear-gradient(135deg, #ff5722 0%, #ff9800 100%)', borderRadius: 8 } },
            React.createElement('div', { style: { fontSize: 32, marginBottom: 8 } }, '🔍'),
            React.createElement('div', { style: { fontSize: 14, fontWeight: 'bold', color: 'white' } }, 'UPSCALE 4K'),
            React.createElement('div', { style: { fontSize: 9, color: 'rgba(255,255,255,0.8)', marginTop: 4 } }, 'Nâng cấp ảnh lên độ phân giải 4K')
        ),

        // Instructions
        React.createElement('div', { style: { marginBottom: 16, padding: 10, background: '#222', borderRadius: 6, fontSize: 10, color: '#ccc' } },
            React.createElement('div', { style: { fontWeight: 'bold', marginBottom: 6, color: '#ff9800' } }, '📋 Hướng dẫn:'),
            React.createElement('div', { style: { marginBottom: 4 } }, '1. Chọn layer chứa ảnh cần upscale'),
            React.createElement('div', { style: { marginBottom: 4 } }, '2. Nhấn nút "Upscale 4K" bên dưới'),
            React.createElement('div', null, '3. Ảnh 4K sẽ được tạo layer mới')
        ),

        // Main Upscale Button
        React.createElement('button', {
            onClick: handleUpscale4K,
            disabled: loading || !key,
            style: {
                width: '100%',
                padding: 20,
                background: loading ? '#666' : 'linear-gradient(135deg, #ff5722 0%, #ff9800 100%)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 'bold',
                cursor: loading ? 'wait' : 'pointer',
                marginBottom: 16,
                boxShadow: '0 4px 15px rgba(255, 87, 34, 0.4)'
            }
        }, loading ? '⏳ Đang xử lý...' : '🚀 UPSCALE 4K'),

        // Note
        React.createElement('div', { style: { padding: 8, background: '#1a1a1a', borderRadius: 4, border: '1px solid #333', fontSize: 9, color: '#888', textAlign: 'center' } },
            '💡 AI sẽ giữ nguyên nội dung và chỉ nâng cấp độ phân giải lên 4K'
        ),

        // Spacer
        React.createElement('div', { style: { flex: 1 } }),

        // Debug Log
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', borderTop: '1px solid #333', paddingTop: 8 } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 } },
                React.createElement('span', { style: { fontSize: 9, color: '#888' } }, 'DEBUG LOG'),
                React.createElement('span', { style: { fontSize: 9, color: '#ff5722', cursor: 'pointer' }, onClick: function () { setLogs([]); } }, 'Xóa')
            ),
            React.createElement('div', { style: { background: '#000', padding: 6, fontSize: 9, color: '#0f0', fontFamily: 'monospace', overflowY: 'auto', border: '1px solid #333', maxHeight: 80 } },
                logs.length === 0 ? 'Chưa có log...' : logs.map(function (l, i) { return React.createElement('div', { key: i, style: { marginBottom: 2 } }, l); })
            )
        ),

        // Cost summary
        React.createElement('div', { style: { textAlign: 'center', paddingTop: 8, fontSize: 10, color: '#FFD700' } },
            '💰 Chi phí: $' + getTotalCost().toFixed(4)
        ),

        // Status
        React.createElement('div', { style: { textAlign: 'center', paddingTop: 4, fontSize: 10, color: status.indexOf('Lỗi') >= 0 ? '#f00' : '#888' } }, status)
    ),

    // === FACE SWAP TAB ===
    activeTab === 'faceswap' && React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column' } },

        // Header
        React.createElement('div', { style: { textAlign: 'center', marginBottom: 12, padding: 10, background: 'linear-gradient(135deg, #e91e63 0%, #9c27b0 100%)', borderRadius: 8 } },
            React.createElement('div', { style: { fontSize: 28, marginBottom: 4 } }, '👤'),
            React.createElement('div', { style: { fontSize: 12, fontWeight: 'bold', color: 'white' } }, 'THAY THẾ KHUÔN MẶT'),
            React.createElement('div', { style: { fontSize: 9, color: 'rgba(255,255,255,0.8)', marginTop: 2 } }, 'Face Swap với AI')
        ),

        // Step 1: Capture Target Image
        React.createElement('div', { style: { marginBottom: 10 } },
            React.createElement('div', { style: { fontSize: 10, fontWeight: 'bold', marginBottom: 6, color: '#e91e63' } }, '📷 Bước 1: Ảnh mục tiêu'),
            React.createElement('div', { style: { fontSize: 9, color: '#888', marginBottom: 6 } }, 'Chọn layer chứa ẢNH có khuôn mặt cần thay thế'),
            React.createElement('button', {
                onClick: handleCaptureFaceTarget,
                disabled: loading,
                style: {
                    width: '100%', padding: 10,
                    background: faceTargetImage ? 'linear-gradient(135deg, #4caf50 0%, #8bc34a 100%)' : 'linear-gradient(135deg, #e91e63 0%, #9c27b0 100%)',
                    color: 'white', border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 'bold',
                    cursor: 'pointer'
                }
            }, faceTargetImage ? '✅ Đã chụp ảnh mục tiêu' : '📸 Chụp ảnh mục tiêu từ Layer')
        ),

        // Step 2: Upload Reference Face
        React.createElement('div', { style: { marginBottom: 10 } },
            React.createElement('div', { style: { fontSize: 10, fontWeight: 'bold', marginBottom: 6, color: '#9c27b0' } }, '📁 Bước 2: Upload khuôn mặt mẫu'),
            React.createElement('div', { style: { fontSize: 9, color: '#888', marginBottom: 6 } }, 'Chọn file ảnh chứa KHUÔN MẶT bạn muốn sử dụng'),
            React.createElement('button', {
                onClick: handleUploadFaceReference,
                disabled: loading,
                style: {
                    width: '100%', padding: 10,
                    background: faceReferenceImage ? 'linear-gradient(135deg, #4caf50 0%, #8bc34a 100%)' : 'linear-gradient(135deg, #9c27b0 0%, #673ab7 100%)',
                    color: 'white', border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 'bold',
                    cursor: 'pointer'
                }
            }, faceReferenceImage ? '✅ Đã upload khuôn mặt mẫu' : '📂 Chọn file khuôn mặt mẫu...')
        ),

        // Status indicators
        (faceReferenceImage || faceTargetImage) && React.createElement('div', { style: { marginBottom: 10, padding: 8, background: '#222', borderRadius: 6 } },
            React.createElement('div', { style: { fontSize: 9, fontWeight: 'bold', marginBottom: 6, color: '#888' } }, '📋 Trạng thái:'),
            React.createElement('div', { style: { display: 'flex', gap: 8 } },
                React.createElement('span', { style: { fontSize: 9, padding: '3px 8px', borderRadius: 4, background: faceTargetImage ? '#4caf50' : '#666', color: 'white' } }, faceTargetImage ? '✓ Ảnh mục tiêu' : '✗ Ảnh mục tiêu'),
                React.createElement('span', { style: { fontSize: 9, padding: '3px 8px', borderRadius: 4, background: faceReferenceImage ? '#4caf50' : '#666', color: 'white' } }, faceReferenceImage ? '✓ Mặt mẫu' : '✗ Mặt mẫu')
            )
        ),

        // Step 3: Execute Face Swap
        React.createElement('div', { style: { marginBottom: 10 } },
            React.createElement('div', { style: { fontSize: 10, fontWeight: 'bold', marginBottom: 6, color: '#ff9800' } }, '🔄 Bước 3: Thay thế'),
            React.createElement('button', {
                onClick: handleFaceSwap,
                disabled: loading || !faceReferenceImage || !faceTargetImage || !key,
                style: {
                    width: '100%', padding: 16,
                    background: (!faceReferenceImage || !faceTargetImage || loading) ? '#666' : 'linear-gradient(135deg, #ff9800 0%, #f44336 100%)',
                    color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 'bold',
                    cursor: (!faceReferenceImage || !faceTargetImage || loading) ? 'not-allowed' : 'pointer',
                    boxShadow: (!faceReferenceImage || !faceTargetImage || loading) ? 'none' : '0 4px 15px rgba(255, 152, 0, 0.4)'
                }
            }, loading ? '⏳ Đang xử lý...' : '🔄 THAY THẾ KHUÔN MẶT')
        ),

        // Note
        React.createElement('div', { style: { padding: 8, background: '#1a1a1a', borderRadius: 4, border: '1px solid #333', fontSize: 9, color: '#888' } },
            React.createElement('div', { style: { fontWeight: 'bold', marginBottom: 4, color: '#ff9800' } }, '💡 Lưu ý:'),
            React.createElement('div', { style: { marginBottom: 2 } }, '• Khuôn mặt mẫu cần rõ ràng, chính diện'),
            React.createElement('div', { style: { marginBottom: 2 } }, '• AI sẽ giữ nguyên tư thế, góc độ từ ảnh mục tiêu'),
            React.createElement('div', null, '• Kết quả 4K chất lượng cao')
        ),

        // Spacer
        React.createElement('div', { style: { flex: 1 } }),

        // Reset button
        (faceReferenceImage || faceTargetImage) && React.createElement('button', {
            onClick: function () { setFaceReferenceImage(''); setFaceTargetImage(''); },
            style: { padding: 8, background: '#333', color: '#888', border: '1px solid #444', borderRadius: 4, fontSize: 9, cursor: 'pointer', marginBottom: 10 }
        }, '🔄 Reset tất cả'),

        // Debug Log
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', borderTop: '1px solid #333', paddingTop: 8 } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 } },
                React.createElement('span', { style: { fontSize: 9, color: '#888' } }, 'DEBUG LOG'),
                React.createElement('span', { style: { fontSize: 9, color: '#e91e63', cursor: 'pointer' }, onClick: function () { setLogs([]); } }, 'Xóa')
            ),
            React.createElement('div', { style: { background: '#000', padding: 6, fontSize: 9, color: '#0f0', fontFamily: 'monospace', overflowY: 'auto', border: '1px solid #333', maxHeight: 80 } },
                logs.length === 0 ? 'Chưa có log...' : logs.map(function (l, i) { return React.createElement('div', { key: i, style: { marginBottom: 2 } }, l); })
            )
        ),

        // Cost summary
        React.createElement('div', { style: { textAlign: 'center', paddingTop: 8, fontSize: 10, color: '#FFD700' } },
            '💰 Chi phí: $' + getTotalCost().toFixed(4)
        ),

        // Status
        React.createElement('div', { style: { textAlign: 'center', paddingTop: 4, fontSize: 10, color: status.indexOf('Lỗi') >= 0 ? '#f00' : '#888' } }, status)
    ),

    // === AUTO BATCH TAB ===
    activeTab === 'batch' && React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } },

        // Header
        React.createElement('div', { style: { textAlign: 'center', marginBottom: 12, padding: 10, background: 'linear-gradient(135deg, #00897b 0%, #26a69a 100%)', borderRadius: 8 } },
            React.createElement('div', { style: { fontSize: 28, marginBottom: 4 } }, '📦'),
            React.createElement('div', { style: { fontSize: 12, fontWeight: 'bold', color: 'white' } }, 'AUTO BATCH'),
            React.createElement('div', { style: { fontSize: 9, color: 'rgba(255,255,255,0.8)', marginTop: 2 } }, 'Ghép ảnh hàng loạt từ thư mục')
        ),

        // Scrollable content area
        React.createElement('div', { style: { flex: 1, overflowY: 'auto', paddingRight: 4 } },

            // Mode Selection
            React.createElement('div', { style: { marginBottom: 10 } },
                React.createElement('label', { style: { fontSize: 9, color: '#888', display: 'block', marginBottom: 3 } }, 'CHẾ ĐỘ GHÉP'),
                React.createElement('div', { style: { display: 'flex', gap: 4 } },
                    React.createElement('button', {
                        onClick: function () { setBatchMode('composite'); },
                        style: {
                            flex: 1, padding: 8, border: 'none', borderRadius: 4, fontSize: 10, fontWeight: 'bold',
                            background: batchMode === 'composite' ? '#00897b' : '#333',
                            color: batchMode === 'composite' ? 'white' : '#888',
                            cursor: 'pointer'
                        }
                    }, '🖼️ Background'),
                    React.createElement('button', {
                        onClick: function () { setBatchMode('template'); },
                        style: {
                            flex: 1, padding: 8, border: 'none', borderRadius: 4, fontSize: 10, fontWeight: 'bold',
                            background: batchMode === 'template' ? '#00897b' : '#333',
                            color: batchMode === 'template' ? 'white' : '#888',
                            cursor: 'pointer'
                        }
                    }, '🎨 Template')
                )
            ),

            // Step 1: Select Input Folder
            React.createElement('div', { style: { marginBottom: 10 } },
                React.createElement('div', { style: { fontSize: 10, fontWeight: 'bold', marginBottom: 6, color: '#26a69a' } }, '📁 Bước 1: Chọn thư mục ảnh'),
                React.createElement('button', {
                    onClick: handleBatchSelectInputFolder,
                    disabled: loading,
                    style: {
                        width: '100%', padding: 10,
                        background: batchInputFiles.length > 0 ? 'linear-gradient(135deg, #4caf50 0%, #8bc34a 100%)' : 'linear-gradient(135deg, #00897b 0%, #26a69a 100%)',
                        color: 'white', border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 'bold', cursor: 'pointer'
                    }
                }, batchInputFiles.length > 0
                    ? '✅ ' + batchInputFolderName + ' (' + batchInputFiles.length + ' ảnh)'
                    : '📂 Chọn thư mục chứa ảnh...'
                ),
                batchInputFiles.length > 0 && React.createElement('div', { style: { marginTop: 4, padding: 6, background: '#222', borderRadius: 4, maxHeight: 60, overflowY: 'auto' } },
                    batchInputFiles.map(function (f, idx) {
                        return React.createElement('div', { key: idx, style: { fontSize: 8, color: '#aaa', marginBottom: 1 } },
                            (idx + 1) + '. ' + f.name
                        );
                    })
                )
            ),

            // Step 2: Select Output Folder
            React.createElement('div', { style: { marginBottom: 10 } },
                React.createElement('div', { style: { fontSize: 10, fontWeight: 'bold', marginBottom: 6, color: '#26a69a' } }, '📤 Bước 2: Chọn thư mục xuất'),
                React.createElement('button', {
                    onClick: handleBatchSelectOutputFolder,
                    disabled: loading,
                    style: {
                        width: '100%', padding: 10,
                        background: batchOutputFolder ? 'linear-gradient(135deg, #4caf50 0%, #8bc34a 100%)' : 'linear-gradient(135deg, #546e7a 0%, #78909c 100%)',
                        color: 'white', border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 'bold', cursor: 'pointer'
                    }
                }, batchOutputFolder
                    ? '✅ Xuất: ' + batchOutputFolderName
                    : '📂 Chọn thư mục xuất kết quả...'
                )
            ),

            // Step 3: Background or Template
            batchMode === 'composite' && React.createElement('div', { style: { marginBottom: 10 } },
                React.createElement('div', { style: { fontSize: 10, fontWeight: 'bold', marginBottom: 6, color: '#26a69a' } }, '🖼️ Bước 3: Chọn Background'),
                React.createElement('button', {
                    onClick: handleBatchBackgroundUpload,
                    disabled: loading,
                    style: {
                        width: '100%', padding: 10,
                        background: batchBackgroundImage ? 'linear-gradient(135deg, #4caf50 0%, #8bc34a 100%)' : 'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)',
                        color: 'white', border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 'bold', cursor: 'pointer'
                    }
                }, batchBackgroundImage ? '✅ Background đã chọn' : '📂 Chọn ảnh background...')
            ),

            // Composite options (only in composite mode)
            batchMode === 'composite' && React.createElement('div', { style: { marginBottom: 10, background: '#222', padding: 8, border: '1px solid #333', borderRadius: 4 } },
                React.createElement('label', { style: { fontSize: 9, color: '#888', display: 'block', marginBottom: 6 } }, 'TÙY CHỌN'),
                React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, cursor: 'pointer', fontSize: 10, color: '#ccc' } },
                    React.createElement('input', {
                        type: 'checkbox', checked: batchOptKeepFace,
                        onChange: function (e) { setBatchOptKeepFace(e.target.checked); },
                        style: { width: 14, height: 14 }
                    }), '🎭 Giữ khuôn mặt'
                ),
                React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, cursor: 'pointer', fontSize: 10, color: '#ccc' } },
                    React.createElement('input', {
                        type: 'checkbox', checked: batchOptKeepPose,
                        onChange: function (e) { setBatchOptKeepPose(e.target.checked); },
                        style: { width: 14, height: 14 }
                    }), '🧍 Giữ tư thế'
                ),
                React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 10, color: '#ccc' } },
                    React.createElement('input', {
                        type: 'checkbox', checked: batchOptMatchLight,
                        onChange: function (e) { setBatchOptMatchLight(e.target.checked); },
                        style: { width: 14, height: 14 }
                    }), '💡 Matching ánh sáng'
                )
            ),

            // Template selection (only in template mode)
            batchMode === 'template' && React.createElement('div', { style: { marginBottom: 10 } },
                React.createElement('div', { style: { fontSize: 10, fontWeight: 'bold', marginBottom: 6, color: '#26a69a' } }, '🎨 Bước 3: Chọn Template'),
                React.createElement('div', { style: { background: '#222', borderRadius: 4, padding: 6, maxHeight: 150, overflowY: 'auto' } },
                    // Baby Templates
                    React.createElement('div', { style: { fontSize: 8, fontWeight: 'bold', marginBottom: 4, color: '#ff9800' } }, '🧒 Bé Yêu'),
                    React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 } },
                        TEMPLATES.filter(function (t) { return t.category === 'baby'; }).map(function (t) {
                            var isSel = batchSelectedTemplate === t.id;
                            return React.createElement('div', {
                                key: t.id,
                                onClick: function () { setBatchSelectedTemplate(t.id); },
                                style: {
                                    padding: '4px 8px', borderRadius: 4, fontSize: 8, cursor: 'pointer',
                                    background: isSel ? '#00897b' : '#333',
                                    color: isSel ? 'white' : '#aaa',
                                    border: isSel ? '1px solid #26a69a' : '1px solid #444'
                                }
                            }, t.icon + ' ' + t.name);
                        })
                    ),
                    // Family Templates
                    React.createElement('div', { style: { fontSize: 8, fontWeight: 'bold', marginBottom: 4, color: '#4caf50' } }, '👨‍👩‍👧‍👦 Gia Đình'),
                    React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
                        TEMPLATES.filter(function (t) { return t.category === 'family'; }).map(function (t) {
                            var isSel = batchSelectedTemplate === t.id;
                            return React.createElement('div', {
                                key: t.id,
                                onClick: function () { setBatchSelectedTemplate(t.id); },
                                style: {
                                    padding: '4px 8px', borderRadius: 4, fontSize: 8, cursor: 'pointer',
                                    background: isSel ? '#00897b' : '#333',
                                    color: isSel ? 'white' : '#aaa',
                                    border: isSel ? '1px solid #26a69a' : '1px solid #444'
                                }
                            }, t.icon + ' ' + t.name);
                        })
                    )
                ),
                // Selected template info
                batchSelectedTemplate && (function () {
                    var t = TEMPLATES.find(function (t) { return t.id === batchSelectedTemplate; });
                    if (!t) return null;
                    return React.createElement('div', { style: { marginTop: 4, padding: 6, background: t.bgColor, borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6 } },
                        React.createElement('span', { style: { fontSize: 20 } }, t.icon),
                        React.createElement('div', null,
                            React.createElement('div', { style: { fontSize: 9, fontWeight: 'bold', color: 'white', textShadow: '0 1px 2px rgba(0,0,0,0.5)' } }, t.name),
                            React.createElement('div', { style: { fontSize: 7, color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 2px rgba(0,0,0,0.5)' } }, t.description)
                        )
                    );
                })()
            ),

            // Aspect Ratio
            React.createElement('div', { style: { marginBottom: 10 } },
                React.createElement('label', { style: { fontSize: 9, color: '#888', display: 'block', marginBottom: 3 } }, '📐 TỈ LỆ ẢNH'),
                React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
                    ASPECT_RATIOS.map(function (ratio) {
                        return React.createElement('button', {
                            key: ratio.id,
                            onClick: function () { setBatchAspectRatio(ratio.value); },
                            style: {
                                padding: '4px 8px',
                                background: batchAspectRatio === ratio.value ? '#00897b' : '#333',
                                color: batchAspectRatio === ratio.value ? 'white' : '#ccc',
                                border: batchAspectRatio === ratio.value ? '2px solid #26a69a' : '1px solid #444',
                                borderRadius: 4, fontSize: 9, cursor: 'pointer'
                            }
                        }, ratio.label);
                    })
                )
            ),

            // Additional prompt
            React.createElement('div', { style: { marginBottom: 10 } },
                React.createElement('label', { style: { fontSize: 9, color: '#888', display: 'block', marginBottom: 3 } }, '📝 TÙY CHỈNH THÊM (tùy chọn)'),
                React.createElement('textarea', {
                    placeholder: 'Thêm yêu cầu cho tất cả ảnh...',
                    value: batchPrompt,
                    onChange: function (e) { setBatchPrompt(e.target.value); },
                    style: { width: '100%', height: 35, padding: 6, background: '#333', border: '1px solid #444', color: 'white', fontSize: 10, resize: 'none', boxSizing: 'border-box' }
                })
            ),

            // Progress Bar (only during/after batch)
            (batchProgress.total > 0) && React.createElement('div', { style: { marginBottom: 10 } },
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 } },
                    React.createElement('span', { style: { fontSize: 9, color: '#888' } }, '⏳ TIẾN ĐỘ'),
                    React.createElement('span', { style: { fontSize: 9, color: '#26a69a', fontWeight: 'bold' } },
                        batchProgress.current + '/' + batchProgress.total + ' (' + Math.round((batchProgress.current / batchProgress.total) * 100) + '%)'
                    )
                ),
                React.createElement('div', { style: { width: '100%', height: 8, background: '#333', borderRadius: 4, overflow: 'hidden' } },
                    React.createElement('div', {
                        style: {
                            width: (batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0) + '%',
                            height: '100%',
                            background: batchProgress.running
                                ? 'linear-gradient(90deg, #00897b 0%, #26a69a 50%, #00897b 100%)'
                                : '#4caf50',
                            borderRadius: 4,
                            transition: 'width 0.3s ease'
                        }
                    })
                )
            ),

            // Batch Results (after or during batch)
            batchResults.length > 0 && React.createElement('div', { style: { marginBottom: 10 } },
                React.createElement('div', { style: { fontSize: 9, color: '#888', marginBottom: 4 } }, '📋 KẾT QUẢ:'),
                React.createElement('div', { style: { maxHeight: 80, overflowY: 'auto', background: '#111', borderRadius: 4, padding: 4, border: '1px solid #333' } },
                    batchResults.map(function (r, idx) {
                        return React.createElement('div', {
                            key: idx,
                            style: { fontSize: 8, marginBottom: 2, padding: '2px 4px', borderRadius: 2, background: r.status === 'success' ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.15)' }
                        },
                            React.createElement('span', { style: { color: r.status === 'success' ? '#4caf50' : '#f44336' } },
                                r.status === 'success' ? '✓' : '✗'
                            ),
                            ' ',
                            React.createElement('span', { style: { color: '#aaa' } }, r.fileName),
                            ' ',
                            React.createElement('span', { style: { color: '#666' } }, '— ' + r.message)
                        );
                    })
                )
            )
        ), // End scrollable content

        // Main Batch Button (fixed at bottom)
        React.createElement('button', {
            onClick: handleBatchProcess,
            disabled: loading || batchInputFiles.length === 0 || !batchOutputFolder ||
                (batchMode === 'composite' && !batchBackgroundImage) ||
                (batchMode === 'template' && !batchSelectedTemplate),
            style: {
                width: '100%', padding: 16, marginTop: 8,
                background: (loading || batchInputFiles.length === 0 || !batchOutputFolder)
                    ? '#666'
                    : 'linear-gradient(135deg, #00897b 0%, #26a69a 100%)',
                color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 'bold',
                cursor: loading ? 'wait' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 15px rgba(0, 137, 123, 0.4)'
            }
        }, loading
            ? '⏳ Đang xử lý ' + batchProgress.current + '/' + batchProgress.total + '...'
            : '🚀 BẮT ĐẦU BATCH (' + batchInputFiles.length + ' ảnh)'
        ),

        // Reset batch
        (batchInputFiles.length > 0 || batchResults.length > 0) && React.createElement('button', {
            onClick: function () {
                setBatchInputFiles([]); setBatchInputFolder(null); setBatchInputFolderName('');
                setBatchOutputFolder(null); setBatchOutputFolderName('');
                setBatchBackgroundImage(''); setBatchSelectedTemplate(null);
                setBatchProgress({ current: 0, total: 0, running: false });
                setBatchResults([]); setBatchPrompt('');
            },
            disabled: loading,
            style: { padding: 6, marginTop: 6, background: '#333', color: '#888', border: '1px solid #444', borderRadius: 4, fontSize: 9, cursor: 'pointer', width: '100%' }
        }, '🔄 Reset Batch'),

        // Debug Log
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', borderTop: '1px solid #333', paddingTop: 8, marginTop: 8 } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 } },
                React.createElement('span', { style: { fontSize: 9, color: '#888' } }, 'DEBUG LOG'),
                React.createElement('span', { style: { fontSize: 9, color: '#00897b', cursor: 'pointer' }, onClick: function () { setLogs([]); } }, 'Xóa')
            ),
            React.createElement('div', { style: { background: '#000', padding: 6, fontSize: 9, color: '#0f0', fontFamily: 'monospace', overflowY: 'auto', border: '1px solid #333', maxHeight: 80 } },
                logs.length === 0 ? 'Chưa có log...' : logs.map(function (l, i) { return React.createElement('div', { key: i, style: { marginBottom: 2 } }, l); })
            )
        ),

        // Cost summary
        React.createElement('div', { style: { textAlign: 'center', paddingTop: 8, fontSize: 10, color: '#FFD700' } },
            '💰 Chi phí: $' + getTotalCost().toFixed(4)
        ),

        // Status
        React.createElement('div', { style: { textAlign: 'center', paddingTop: 4, fontSize: 10, color: status.indexOf('Lỗi') >= 0 ? '#f00' : '#888' } }, status)
    )
);
}

// Render - using legacy ReactDOM.render for better UXP compatibility
ReactDOM.render(React.createElement(App), document.getElementById('root'));
