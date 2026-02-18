/**
 * FaceQC.js - AI-Powered Face Anatomy Validation
 * Uses Gemini 2.0 Flash for rapid anatomical & identity verification.
 */

// Helper to extract JSON from response
function extractJson(text) {
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Validate Anatomical Structure & Identity
 * @param {string} originalB64 - Original face image
 * @param {string} resultB64 - Generated image
 * @param {string} apiKey - Gemini API Key
 * @returns {Promise<{pass: boolean, score: number, issues: string}>}
 */
export async function validateFaceAnatomy(originalB64, resultB64, apiKey) {
    if (!apiKey) return { pass: true, score: 0, issues: 'No API Key' };

    const prompt = `
    ROLE: Master Anatomist & Forensic Image Analyst.
    TASK: Compare the RESULT image against the ORIGINAL source image.
    
    STRICT ANATOMICAL CHECKLIST:
    1. EYE GEOMETRY: Check pupil roundness, iris color, eye shape symmetry. Are eyes wandering (strabismus) if not present in original?
    2. NOSE & MOUTH: Check philtrum length, lip shape, and nasolabial folds. Is the mouth skewed?
    3. SKIN TEXTURE: Is it realistic skin with pores/texture, or smooth plastic AI skin?
    4. SKELETAL STRUCTURE: Does the jawline and cheekbone structure match the original identity perfectly?
    5. LIMBS/Hands (if visible): Count fingers. Check joint articulation.
    
    SCORING (1-10):
    - 10: Perfect biological realism & identity match.
    - 8-9: Minor lighting differences, anatomy perfect.
    - 1-7: Anatomical failure (warped eyes, plastic skin, wrong identity).

    OUTPUT ONLY JSON:
    {
      "anatomy_score": number, // 1-10
      "identity_score": number, // 1-10
      "pass": boolean, // true if BOTH scores >= 8
      "issue": "Brief description of the anatomical fail (e.g. 'Left eye distorted', 'Plastic skin texture')"
    }
  `;

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: "ORIGINAL FACE:" },
                        { inlineData: { mimeType: 'image/jpeg', data: originalB64 } },
                        { text: "RESULT IMAGE:" },
                        { inlineData: { mimeType: 'image/jpeg', data: resultB64 } },
                        { text: prompt }
                    ]
                }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        if (!res.ok) return { pass: true, score: 0, issues: 'API Fail' }; // Fail open to avoid blocking

        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const result = extractJson(text);

        if (result) {
            return {
                pass: result.pass,
                score: Math.min(result.anatomy_score, result.identity_score),
                issues: result.issue || 'Unknown issue'
            };
        }
        return { pass: true, score: 0, issues: 'Parse Fail' };

    } catch (e) {
        console.warn('FaceQC Error:', e);
        return { pass: true, score: 0, issues: 'Error' };
    }
}
