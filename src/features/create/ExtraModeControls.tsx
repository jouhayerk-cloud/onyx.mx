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

import {useAtom, useSetAtom} from 'jotai/react';
import React, {useEffect, useState} from 'react';
import {
  allAnnotationDataAtom,
  editingMaskIndexAtom,
  editedMaskPointsAtom,
  imageDimensionsAtom,
  ImageSrcAtom,
  InventoryVersionAtom,
  selectedBoxesAtom,
  selectedPointsAtom,
  SelectedItemDataAtom,
  SelectedItemRowAtom,
  SelectedMasksAtom,
  workflowStepAtom,
  userAtom,
  creationGalleryIndexAtom,
  creationGalleryFilesAtom,
  isInventoryPanelOpenAtom,
  isDetailsPanelOpenAtom,
} from '../../lib/atoms';
import {SCRIPT_URL, segmentationColors} from '../../lib/consts';
import {useTranslation, useNotify} from '../../lib/hooks';
import {InventoryItemData} from '../../lib/Types';
import {createCurvePath, extractGradientFromMask, generatePngAndSvgFromMasks} from '../../lib/utils';

export function ExtraModeControls() {
  const t = useTranslation();
  const notify = useNotify();
  const [allAnnotationData, setAllAnnotationData] = useAtom(
    allAnnotationDataAtom,
  );

  const [editingMaskIndex, setEditingMaskIndex] = useAtom(editingMaskIndexAtom);
  const [editedMaskPoints] = useAtom(editedMaskPointsAtom);
  const [imageDimensions] = useAtom(imageDimensionsAtom);
  const [imageSrc, setImageSrc] = useAtom(ImageSrcAtom);
  const [selectedItemRow] = useAtom(SelectedItemRowAtom);
  const [selectedItemData] = useAtom(SelectedItemDataAtom);
  const [selectedMasks, setSelectedMasks] = useAtom(SelectedMasksAtom);
  const [selectedBoxes, setSelectedBoxes] = useAtom(selectedBoxesAtom);
  const [selectedPoints, setSelectedPoints] = useAtom(selectedPointsAtom);
  const setInventoryVersion = useSetAtom(InventoryVersionAtom);
  const [user] = useAtom(userAtom);
  const [workflowStep, setWorkflowStep] = useAtom(workflowStepAtom);
  const [creationGalleryIndex, setCreationGalleryIndex] = useAtom(
    creationGalleryIndexAtom,
  );
  const [galleryFiles] = useAtom(creationGalleryFilesAtom);
  const setIsInventoryPanelOpen = useSetAtom(isInventoryPanelOpenAtom);
  const setIsDetailsPanelOpen = useSetAtom(isDetailsPanelOpenAtom);
  const [isExporting, setIsExporting] = useState<'png' | 'svg' | false>(false);

  // Pre-select all annotations when editor opens
  useEffect(() => {
    if (editingMaskIndex !== null) {
      setSelectedMasks(
        allAnnotationData.masks.map((_, index) => index),
      );
      setSelectedBoxes(allAnnotationData.boxes.map((_, index) => index));
      setSelectedPoints(
        allAnnotationData.points.map((_, index) => index),
      );
    }
  }, [
    editingMaskIndex,
    allAnnotationData.masks,
    allAnnotationData.boxes,
    allAnnotationData.points,
    setSelectedMasks,
    setSelectedBoxes,
    setSelectedPoints,
  ]);

  const handleSaveChanges = async () => {
    const isCreationMode = galleryFiles.length > 0;
    console.log(`[Mask Editor] Initiating "Save Changes" in ${isCreationMode ? 'creation' : 'edit'} mode.`);
    
    let editedAnnotations = {...allAnnotationData};
    if (editingMaskIndex !== null && editedMaskPoints) {
      console.log(`[Mask Editor] Applying vector edits from editor to mask #${editingMaskIndex}.`);
      const {width: imageWidth, height: imageHeight} = imageDimensions;
      const originalMask = editedAnnotations.masks[editingMaskIndex];
      const {x, y, width, height, maskWidth, maskHeight} = originalMask;
      const imagePixelX = x * imageWidth;
      const imagePixelY = y * imageHeight;
      const imagePixelWidth = width * imageWidth;
      const imagePixelHeight = height * imageHeight;

      if (imageWidth > 1 && imagePixelWidth > 0 && imagePixelHeight > 0) {
          const originalPoints = editedMaskPoints.map(p => ({
              x: ((p.x - imagePixelX) / imagePixelWidth) * maskWidth,
              y: ((p.y - imagePixelY) / imagePixelHeight) * maskHeight,
          }));

          const newPath = createCurvePath(originalPoints);
          const newMasks = [...editedAnnotations.masks];
          newMasks[editingMaskIndex] = {
              ...originalMask,
              points: originalPoints,
              path: newPath,
          };
          editedAnnotations = {...editedAnnotations, masks: newMasks};
          setAllAnnotationData(editedAnnotations); // Update state for UI consistency
      }
    }

    const toastId = notify.loading('Saving mask data...');

    try {
      const masksToExport = editedAnnotations.masks.filter((_, index) => selectedMasks.includes(index));
      const { pngData, svgData } = await generatePngAndSvgFromMasks(imageSrc, imageDimensions, masksToExport);
      
      let gradientColor: string | null = null;
      if (masksToExport.length > 0 && imageSrc) {
          try {
              gradientColor = await extractGradientFromMask(imageSrc, masksToExport[0], imageDimensions);
          } catch(e) {
              console.error("Failed to auto-extract gradient", e);
          }
      }

      const masksForSaving = editedAnnotations.masks.map(({ path, ...rest }) => rest);
      
      const payload: Partial<InventoryItemData> = {
        spatialMasks: JSON.stringify(masksForSaving),
        spatialBoxes2d: JSON.stringify(editedAnnotations.boxes),
        spatialPoints: JSON.stringify(editedAnnotations.points),
      };

      if (gradientColor) {
        payload.color = gradientColor;
      }

      if (!selectedItemRow) throw new Error("No item is selected to save data to.");
      
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'updateFullItem',
          row: selectedItemRow,
          itemData: payload,
          generatedPngData: pngData,
          generatedSvgData: svgData,
          user,
        }),
      });
      const result = await response.json();
      if (result.status !== 'success') throw new Error(result.message);
      
      notify.success(t.maskSavedSuccess, { id: toastId });
      setInventoryVersion(v => v + 1);

      setEditingMaskIndex(null);
      setWorkflowStep('formReview');
      setIsDetailsPanelOpen(true);

    } catch (error: any) {
      console.error('[Mask Editor] Save failed:', error);
      notify.error(`Save failed: ${error.message}`, { id: toastId });
    }
  };

  const handleCancel = () => {
    setEditingMaskIndex(null);
    setWorkflowStep(galleryFiles.length > 0 ? 'processing' : 'idle');
  };

  const handleExport = async (type: 'png' | 'svg') => {
    if (!imageSrc) return;
    const masksToExport = allAnnotationData.masks.filter((_, index) =>
      selectedMasks.includes(index),
    );
    if (masksToExport.length === 0) {
      notify(t.noMasksToExport);
      return;
    }

    setIsExporting(type);
    const toastId = notify.loading(
      type === 'png' ? t.exporting : t.savingSVG,
    );

    try {
      const {pngData, svgData} = await generatePngAndSvgFromMasks(
        imageSrc,
        imageDimensions,
        masksToExport,
      );
      const data =
        type === 'png'
          ? pngData
          : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData!)}`;
      if (!data) throw new Error('Generated data is empty.');

      const link = document.createElement('a');
      link.href = data;
      link.download = `export.${type}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      notify.success(
        type === 'png' ? t.pngExportSuccess : t.svgExportSuccess,
        {id: toastId},
      );
    } catch (error: any) {
      notify.error(
        type === 'png'
          ? `${t.pngExportError} ${error.message}`
          : `${t.svgExportError} ${error.message}`,
        {id: toastId},
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 border-t border-[var(--border-color)] bg-[var(--sidebar-bg)]">
      <div className="flex items-center gap-4">
        <label
          htmlFor="mask-selector"
          className="text-xs font-bold uppercase text-[var(--text-color-secondary)] shrink-0">
          {t.selectMaskToEdit}
        </label>
        <select
          id="mask-selector"
          value={editingMaskIndex ?? ''}
          onChange={(e) => setEditingMaskIndex(Number(e.target.value))}
          className="grow"
          disabled={allAnnotationData.masks.length === 0}>
          {allAnnotationData.masks.length > 0 ? (
            allAnnotationData.masks.map((mask, index) => (
              <option key={index} value={index}>
                {`${t.maskLabel} ${index + 1}: ${mask.label}`}
              </option>
            ))
          ) : (
            <option>No masks loaded</option>
          )}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          className="button secondary grow"
          onClick={() => handleExport('png')}
          disabled={isExporting !== false}>
          {isExporting === 'png' ? t.exporting : t.exportPNG}
        </button>
        <button
          className="button secondary grow"
          onClick={() => handleExport('svg')}
          disabled={isExporting !== false}>
          {isExporting === 'svg' ? t.savingSVG : t.exportSVG}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={handleCancel} className="button secondary grow">
          {t.cancelEdit}
        </button>
        <button onClick={handleSaveChanges} className="button grow">
          {t.saveChanges}
        </button>
      </div>
    </div>
  );
}
