

import { ai } from '@/lib/ai';
import { useAtom, useSetAtom } from 'jotai/react';
import React, { useState } from 'react';

import {
  allAnnotationDataAtom,
  creationGalleryIndexAtom,
  creationVendorIdAtom,
  editingMaskIndexAtom,
  ImageSrcAtom,
  IsLoadingAtom,
  SelectedItemDataAtom,
  SelectedItemRowAtom,
  userAtom,
  workflowStepAtom,
} from '../../lib/atoms';
import { SCRIPT_URL } from '../../lib/consts';
import { supabase } from '../../lib/supabase';
import { GeminiIcon } from '../../components/GeminiIcon';
import { useTranslation, useNotify } from '../../lib/hooks';
import {
  BoundingBox2DType,
  BoundingBoxMaskType,
  PointingType,
} from '../../lib/Types';
import { createCurvePath, findContour, loadImage, simplifyContour } from '../../lib/utils';
import { tr } from '../../lib/i18n';



export function ActionPanel() {
  const t = useTranslation();
  const notify = useNotify();
  const [workflowStep, setWorkflowStep] = useAtom(workflowStepAtom);
  const [isLoading, setIsLoading] = useAtom(IsLoadingAtom);
  const [prompt, setPrompt] = useState(t.promptPlaceholderItems);
  const [negPrompt, setNegPrompt] = useState('');

  const setAllAnnotationData = useSetAtom(allAnnotationDataAtom);
  const [imageSrc] = useAtom(ImageSrcAtom);
  const setEditingMaskIndex = useSetAtom(editingMaskIndexAtom);
  const [creationGalleryIndex] = useAtom(creationGalleryIndexAtom);
  const [creationVendorId] = useAtom(creationVendorIdAtom);
  const [user] = useAtom(userAtom);
  const setSelectedItemRow = useSetAtom(SelectedItemRowAtom);
  const setSelectedItemData = useSetAtom(SelectedItemDataAtom);

  const handleSend = async () => {
    if (!imageSrc) {
      notify.error(tr("Please select an image first."));
      return;
    }
    setIsLoading(true);

    if (workflowStep === 'idle') {
      if (!creationVendorId) {
        notify.error(tr("Please select a vendor ID in the top bar."));
        setIsLoading(false);
        return;
      }
      try {
        console.log('[Backend] Creating initial item entry in Supabase...');
        const newId = crypto.randomUUID();
        const { data, error } = await supabase.from('inventory').insert({
          id: newId,
          vendor_id: creationVendorId,
          timestamp: new Date().toISOString(),
          status: 'Draft',
          updated_at: new Date().toISOString(),
          created_by: user?.name || user?.email,
        }).select().single();

        if (error) throw error;

        console.log(`[Backend] Initial item created with ID ${data.id}.`);
        setSelectedItemRow(data.id);
        setSelectedItemData(data as any);
      } catch (error: any) {
        console.error('[Backend] Failed to create initial item:', error);
        notify.error(`Failed to start creation: ${error.message}`);
        setIsLoading(false);
        return;
      }
    }

    console.log(`[AI Workflow] Step '${workflowStep}': Starting request.`);
    const fullPromptText = `${workflowStep === 'idle'
        ? `${t.detectAndTagPromptPrefix} ${prompt}`
        : `${t.generateMaskPromptPrefix} ${prompt}`
      }${negPrompt ? `. ${t.ignoreFollowing}: ${negPrompt}` : ''
      }${workflowStep === 'idle'
        ? t.detectAndTagPromptSuffix
        : t.generateMaskPromptSuffix
      }`;

    console.log('[AI Workflow] Full prompt being sent:', fullPromptText);

    try {
      const image = await loadImage(imageSrc);
      const canvas = document.createElement('canvas');
      const MAX_DIM = 640;
      const scale = Math.min(1, MAX_DIM / image.width, MAX_DIM / image.height);
      canvas.width = image.width * scale;
      canvas.height = image.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');

      console.log(`[AI Workflow] Image prepared for API. Size: ${Math.round(dataUrl.length / 1024)} KB`);

      const imagePart = {
        inlineData: {
          data: dataUrl.split(',')[1],
          mimeType: 'image/png',
        },
      };

      const modelName = 'gemini-2.5-flash';
      console.log(`[AI Workflow] Sending request to model: ${modelName}`);

      const response = await ai.models.generateContent({
        model: modelName,
        contents: { parts: [imagePart, { text: fullPromptText }] },
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 } // Maximize output tokens
        },
      });

      const jsonText = response.text.trim();
      console.log(`[AI Workflow] Received raw JSON response (${Math.round(jsonText.length / 1024)} KB).`);

      const json = JSON.parse(jsonText);

      if (workflowStep === 'idle') {
        const boxes: BoundingBox2DType[] = (json.boxes || []).map((b: any) => ({
          x: b.box_2d[1] / 1000,
          y: b.box_2d[0] / 1000,
          width: (b.box_2d[3] - b.box_2d[1]) / 1000,
          height: (b.box_2d[2] - b.box_2d[0]) / 1000,
          label: b.label,
        }));
        const points: PointingType[] = (json.points || []).map((p: any) => ({
          point: {
            x: p.point[1] / 1000,
            y: p.point[0] / 1000,
          },
          label: p.label,
        }));
        console.log(`[AI Workflow] Parsed ${boxes.length} boxes and ${points.length} points.`);
        setAllAnnotationData((prev) => ({ ...prev, boxes, points }));
        setWorkflowStep('processing');
        console.log('[App State] Workflow step changed: idle -> processing');
        setPrompt(t.promptPlaceholderObjects); // Set default for next step
      } else if (workflowStep === 'processing') {
        console.log(`[AI Workflow] Processing ${json.length} masks from response.`);
        const masksPromises = (json || []).map(async (m: any, index: number) => {
          const maskData = m.mask.startsWith('data:image')
            ? m.mask
            : `data:image/png;base64,${m.mask}`;
          console.log(`[Mask Process #${index}] Base64 size: ${Math.round(maskData.length / 1024)} KB`);

          const maskImage = await loadImage(maskData);
          const maskCanvas = document.createElement('canvas');
          maskCanvas.width = maskImage.width;
          maskCanvas.height = maskImage.height;
          const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })!;
          maskCtx.drawImage(maskImage, 0, 0);
          const imageData = maskCtx.getImageData(0, 0, maskImage.width, maskImage.height);

          const contour = findContour(imageData);
          console.log(`[Mask Process #${index}] Found ${contour.length} contour points.`);

          const simplified = simplifyContour(contour, 1.5);
          const path = createCurvePath(simplified);

          return {
            x: m.box_2d[1] / 1000,
            y: m.box_2d[0] / 1000,
            width: (m.box_2d[3] - m.box_2d[1]) / 1000,
            height: (m.box_2d[2] - m.box_2d[0]) / 1000,
            label: m.label,
            maskWidth: maskImage.width,
            maskHeight: maskImage.height,
            path: path,
            points: simplified,
          };
        });

        const masks: BoundingBoxMaskType[] = await Promise.all(masksPromises);
        console.log(`[AI Workflow] Successfully processed ${masks.length} masks into vector paths.`);
        setAllAnnotationData((prev) => ({ ...prev, masks }));
      }
    } catch (error: any) {
      console.error("[AI Workflow] Request failed:", error);
      notify.error(`Request failed: ${error.message}`);
    } finally {
      setIsLoading(false);
      console.log('[AI Workflow] Request finished.');
    }
  };

  const handleNextStep = () => {
    if (workflowStep === 'idle') {
      setWorkflowStep('processing');
      console.log('[App State] Workflow step changed: idle -> processing (skipped)');
      setPrompt(t.promptPlaceholderObjects);
    } else if (workflowStep === 'processing') {
      setEditingMaskIndex(0); // Open editor with the first mask
      setWorkflowStep('fullscreenEdit');
      console.log('[App State] Workflow step changed: processing -> fullscreenEdit');
    }
  };

  const currentStep =
    workflowStep === 'idle'
      ? { title: t.step1Title, button: t.buttonDetectAndTag }
      : { title: t.step2Title, button: t.buttonGenerate };

  return (
    <div className="flex flex-col gap-3 h-full">
      <h3 className="text-sm font-bold uppercase text-(--text-color-secondary)">
        {`Image ${creationGalleryIndex + 1} - ${currentStep.title}`}
      </h3>
      <div className="flex flex-col gap-2 grow">
        <textarea
          className="w-full text-sm rounded-lg"
          placeholder={
            workflowStep === 'idle'
              ? t.promptPlaceholderItems
              : t.promptPlaceholderObjects
          }
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <textarea
          className="w-full text-xs rounded-lg"
          placeholder={t.thingsToIgnore}
          value={negPrompt}
          onChange={(e) => setNegPrompt(e.target.value)}
        />
      </div>
      <div className="flex gap-2 items-center">
        <button
          className="button bg-transparent! grow flex items-center justify-center gap-2"
          onClick={handleSend}
          disabled={isLoading}
        >
          <GeminiIcon />
          {isLoading ? t.processing : currentStep.button}
        </button>
        <button
          className="button secondary"
          onClick={handleNextStep}
          disabled={isLoading}
        >
          {workflowStep === 'processing' ? t.editMasks : t.skip}
        </button>
      </div>
      {workflowStep === 'processing' && (
        <button
          className="button w-full"
          onClick={() => {
            console.log('[App State] Workflow step changed: processing -> formReview');
            setWorkflowStep('formReview');
          }}
          disabled={isLoading}
        >
          {t.finishAndReview}
        </button>
      )}
    </div>
  );
}