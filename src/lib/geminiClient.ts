export const getApiKey = () => {
    const key = localStorage.getItem('ONYX_GEMINI_KEY') || import.meta.env.VITE_GEMINI_API_KEY || '';
    const clean = String(key).trim().replace(/['"]/g, '');
    return (clean === 'null' || clean === 'undefined') ? '' : clean;
};

export const callGemini = async (
    prompt: string,
    imgData: string | null,
    timeoutMs: number = 40000,
    modelId: string = "gemini-2.5-flash",
    responseSchema?: any,
) => {
    const API_KEY = getApiKey();
    if (!API_KEY) throw new Error("API Key missing");
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${API_KEY}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({ 
                contents: [{ 
                    parts: [
                        { text: prompt },
                        ...(imgData ? [{ inlineData: { mimeType: 'image/jpeg', data: imgData } }] : []),
                    ] 
                }],
                generationConfig: responseSchema ? {
                    responseMimeType: "application/json",
                    responseSchema: responseSchema
                } : undefined
            })
        });
        
        clearTimeout(timeoutId);
        
        if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Gemini API Error: ${res.status} ${res.statusText} - ${errBody}`);
        }
        
        return await res.json();
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
};
