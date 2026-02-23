/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
// Copyright 2024 Google LLC

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     https://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React, { useState, useRef, useCallback } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
// FIX: Changed jszip import to a namespace import to fix widespread TypeScript type inference issues.
import * as JSZip from 'jszip';

// === Types ===
interface AnalysisResult {
  timestamp: number;
  itemName: string;
  imageDataUrl: string;
}

interface GeminiAnalysisResponse {
  itemFound: boolean;
  itemName: string;
}

// === Icons ===
const UploadIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
);

const CsvIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125v-1.5c0-.621.504-1.125 1.125-1.125H20.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0v-1.5m17.25 0v-1.5m0 0v-12c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v12m0 0h17.25m-6-6v6m-3-3v3m-3-6v6" />
    </svg>
);

const DownloadIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
);

const ImageIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </svg>
);

const RestartIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 11.664 0l3.18-3.185m-3.18-3.182-3.182-3.182a8.25 8.25 0 0 0-11.664 0l-3.18 3.185" />
    </svg>
);


const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
const model = 'gemini-2.5-flash';

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    itemFound: {
      type: Type.BOOLEAN,
      description: "True if one of the items from the list is clearly visible, false otherwise.",
    },
    itemName: {
      type: Type.STRING,
      description: "The name of the item found from the list. Should be an empty string if itemFound is false.",
    },
  },
  required: ['itemFound', 'itemName'],
};

const analyzeFrame = async (
  imageDataUrl: string,
  items: string[]
): Promise<GeminiAnalysisResponse | null> => {
  if (!ai) {
    throw new Error("Gemini AI client is not initialized. Make sure API_KEY is set.");
  }
  
  const base64Data = imageDataUrl.split(',')[1];

  const imagePart = {
    inlineData: {
      mimeType: 'image/jpeg',
      data: base64Data,
    },
  };

  const textPart = {
    text: `Analyze this image. Does it contain any of these items: "${items.join(', ')}"? Respond only in the requested JSON format. Identify only one item per image, the most prominent one.`,
  };

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [imagePart, textPart] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: analysisSchema,
        temperature: 0.2,
      },
    });

    const jsonText = response.text.trim();
    const parsedJson = JSON.parse(jsonText) as GeminiAnalysisResponse;
    
    if (parsedJson.itemFound && !items.some(item => parsedJson.itemName.toLowerCase().includes(item.toLowerCase()))) {
        return { itemFound: false, itemName: "" };
    }

    return parsedJson;

  } catch (error) {
    console.error('Error analyzing frame with Gemini:', error);
    return null;
  }
};


// === Utilities ===
const extractFrame = (
  videoElement: HTMLVideoElement,
  canvasElement: HTMLCanvasElement,
  timestamp: number
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const seekTimeout = setTimeout(() => {
        reject(new Error(`Seek timed out at ${timestamp}s`));
    }, 5000);

    videoElement.currentTime = timestamp;

    const onSeeked = () => {
      clearTimeout(seekTimeout);
      videoElement.removeEventListener('seeked', onSeeked);
      videoElement.removeEventListener('error', onError);

      const context = canvasElement.getContext('2d');
      if (context) {
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
        context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
        resolve(canvasElement.toDataURL('image/jpeg', 0.8));
      } else {
        reject(new Error('Could not get canvas context.'));
      }
    };
    
    const onError = (e: Event) => {        
        clearTimeout(seekTimeout);
        videoElement.removeEventListener('seeked', onSeeked);
        videoElement.removeEventListener('error', onError);
        reject(new Error(`Video seeking failed: ${e}`));
    };
    
    videoElement.addEventListener('seeked', onSeeked, { once: true });
    videoElement.addEventListener('error', onError, { once: true });
  });
};

const formatTimestamp = (seconds: number): string => {
  return new Date(seconds * 1000).toISOString().substr(11, 8);
};

const exportToCsv = (results: AnalysisResult[], fileName: string) => {
    const headers = ['Item Name', 'Timestamp (seconds)', 'Formatted Timestamp'];
    const rows = results.map(r => [`"${r.itemName}"`, r.timestamp, formatTimestamp(r.timestamp)]);
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `${fileName.replace(/\.[^/.]+$/, "")}_analysis.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const downloadImagesAsZip = async (results: AnalysisResult[], fileName: string, setExporting: (isExporting: boolean) => void) => {
    setExporting(true);
    const zip = new JSZip();
    results.forEach(result => {
        const base64Data = result.imageDataUrl.split(',')[1];
        zip.file(`frame_at_${result.timestamp}s.jpg`, base64Data, { base64: true });
    });

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = `${fileName.replace(/\.[^/.]+$/, "")}_captures.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setExporting(false);
};

export const VideoAnalysisView: React.FC = () => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [itemsToFind, setItemsToFind] = useState<string>('');
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setFileName(file.name);
    } else {
      setVideoFile(null);
      setFileName('');
    }
  };

  const handleAnalysis = useCallback(async () => {
    if (!videoFile || !itemsToFind.trim() || !videoRef.current || !canvasRef.current) {
      setError('Please select a video file and enter items to find.');
      return;
    }
    if (!ai) {
      setError('Gemini AI client is not initialized. Make sure your API key is configured correctly.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResults([]);
    setProgress(0);
    
    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;
    const items = itemsToFind.split(',').map(item => item.trim()).filter(Boolean);
    if (items.length === 0) {
        setError('Please enter at least one item to find.');
        setIsAnalyzing(false);
        return;
    }

    const videoUrl = URL.createObjectURL(videoFile);
    videoElement.src = videoUrl;

    videoElement.onloadedmetadata = async () => {
      const duration = videoElement.duration;
      const interval = 1;
      const newResults: AnalysisResult[] = [];

      try {
        for (let t = 0; t <= duration; t += interval) {
          const imageDataUrl = await extractFrame(videoElement, canvasElement, t);
          const analysis = await analyzeFrame(imageDataUrl, items);
          if (analysis && analysis.itemFound) {
            newResults.push({
              timestamp: Math.round(t),
              itemName: analysis.itemName,
              imageDataUrl: imageDataUrl,
            });
            setResults([...newResults]);
          }
          setProgress((t / duration) * 100);
        }
      } catch (e) {
          console.error(e);
          setError(`An error occurred during analysis. Details: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setIsAnalyzing(false);
        URL.revokeObjectURL(videoUrl);
      }
    };

    videoElement.onerror = () => {
        setError('Failed to load video. The file might be corrupted or in an unsupported format.');
        setIsAnalyzing(false);
        URL.revokeObjectURL(videoUrl);
    };

  }, [videoFile, itemsToFind]);

  const handleReset = () => {
    setVideoFile(null);
    setItemsToFind('');
    setResults([]);
    setIsAnalyzing(false);
    setProgress(0);
    setError(null);
    setFileName('');
    setIsExporting(false);
  };

  return (
    <div className="w-full h-full flex flex-col md:flex-row p-4 sm:p-6 md:p-8 gap-8 overflow-hidden">
        <video ref={videoRef} style={{ display: 'none' }} crossOrigin="anonymous" muted playsInline />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Setup Panel */}
        <aside className="md:w-1/3 xl:w-1/4 shrink-0 space-y-6 flex flex-col">
            <div className="glass-panel p-6 space-y-4">
                <h2 className="text-xl font-bold">1. Upload Video</h2>
                <label htmlFor="video-upload" className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-[var(--border-color)] border-dashed rounded-md cursor-pointer hover:border-[var(--accent-color)] transition-colors">
                    <div className="space-y-1 text-center">
                        <UploadIcon className="mx-auto h-12 w-12 text-[var(--text-color-secondary)]" />
                        <div className="flex text-sm text-[var(--text-color-secondary)]">
                            <span className="relative rounded-md font-medium text-[var(--accent-color)]">
                                Select a file
                            </span>
                            <p className="pl-1">or drag and drop</p>
                        </div>
                        <p className="text-xs text-[var(--text-color-secondary)]">{fileName || 'MP4, MOV, etc.'}</p>
                    </div>
                </label>
                <input id="video-upload" name="video-upload" type="file" className="sr-only" accept="video/*" onChange={handleFileChange} />
            </div>

            <div className="glass-panel p-6 space-y-4">
                <h2 className="text-xl font-bold">2. Items to Find</h2>
                <textarea
                    id="items-input"
                    rows={4}
                    className="w-full"
                    placeholder="e.g. red car, dog, person holding a sign"
                    value={itemsToFind}
                    onChange={(e) => setItemsToFind(e.target.value)}
                />
                <p className="text-sm text-[var(--text-color-secondary)]">Enter a comma-separated list of items.</p>
            </div>

            <div className="mt-auto pt-6">
                <button onClick={handleAnalysis} disabled={isAnalyzing || !videoFile || !itemsToFind.trim()} className="button w-full">
                    {isAnalyzing ? 'Analyzing...' : 'Start Analysis'}
                </button>
            </div>
        </aside>

        {/* Results Panel */}
        <main className="flex-1 flex flex-col glass-panel overflow-hidden">
            <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center">
                <h2 className="text-xl font-bold">Results</h2>
                {results.length > 0 && (
                    <div className="flex items-center gap-2">
                        <button onClick={() => exportToCsv(results, fileName)} className="button secondary !min-h-0 text-xs py-1 px-3 flex items-center gap-2"><CsvIcon className="w-4 h-4" /> CSV</button>
                        <button onClick={() => downloadImagesAsZip(results, fileName, setIsExporting)} disabled={isExporting} className="button secondary !min-h-0 text-xs py-1 px-3 flex items-center gap-2">
                            {isExporting ? <ImageIcon className="w-4 h-4 animate-spin" /> : <DownloadIcon className="w-4 h-4"/>}
                            {isExporting ? 'Zipping...' : 'Images'}
                        </button>
                        <button onClick={handleReset} className="button secondary !min-h-0 text-xs py-1 px-3 flex items-center gap-2"><RestartIcon className="w-4 h-4" /> New</button>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto">
                {error && (
                    <div className="m-4 bg-red-900/50 border border-red-700/50 text-red-200 px-4 py-3 rounded-lg" role="alert">
                        <strong className="font-bold">Error: </strong>
                        <span className="block sm:inline">{error}</span>
                    </div>
                )}

                {isAnalyzing ? (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                        <div className="w-full max-w-md">
                            <h3 className="text-lg font-semibold text-white mb-4">Analyzing Video...</h3>
                            <div className="w-full bg-[var(--input-color)] rounded-full h-2.5">
                                <div className="bg-[var(--accent-color)] h-2.5 rounded-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }}></div>
                            </div>
                            <p className="mt-4 text-2xl font-bold text-[var(--accent-color)]">{Math.round(progress)}%</p>
                            <p className="mt-2 text-sm text-[var(--text-color-secondary)]">Please keep this tab open. Analysis may take a few minutes.</p>
                        </div>
                    </div>
                ) : results.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
                        {results.map((result, index) => (
                            <div key={index} className="group relative overflow-hidden rounded-lg glass-panel !bg-transparent">
                                <img src={result.imageDataUrl} alt={`Frame at ${result.timestamp}s`} className="w-full h-48 object-cover transition-transform duration-300 group-hover:scale-110"/>
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
                                <div className="absolute bottom-0 left-0 p-3 text-white w-full">
                                    <h3 className="font-bold text-md capitalize">{result.itemName}</h3>
                                    <p className="text-sm text-slate-300">Time: {formatTimestamp(result.timestamp)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-center p-8">
                        <div className="max-w-md">
                            <svg className="mx-auto h-16 w-16 text-[var(--text-color-secondary)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 15.75-2.489-2.489m0 0a3.375 3.375 0 1 0-4.773-4.773 3.375 3.375 0 0 0 4.774 4.774ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                            <h3 className="mt-4 text-xl font-bold">Awaiting Analysis</h3>
                            <p className="mt-2 text-[var(--text-color-secondary)]">
                                Your video analysis results will appear here once the process is complete.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </main>
    </div>
  );
};