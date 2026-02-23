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
import React, {
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {useResizeDetector} from 'react-resize-detector';
import {
  allAnnotationDataAtom,
  draggingPointInfoAtom,
  editedMaskPointsAtom,
  editorPanOffsetAtom,
  editorZoomAtom,
  editingMaskIndexAtom,
  imageDimensionsAtom,
  ImageSrcAtom,
  isPanningAtom,
  selectedPointsIndicesAtom,
  ShareStreamAtom,
  VideoRefAtom,
} from '../lib/atoms';
import {segmentationColors} from '../lib/consts';
import {BoundingBoxMaskType} from '../lib/Types';
import {createCurvePath} from '../lib/utils';

export function Content() {
  const [imageSrc] = useAtom(ImageSrcAtom);
  const [stream] = useAtom(ShareStreamAtom);
  const [videoRef] = useAtom(VideoRefAtom);
  const setImageDimensions = useSetAtom(imageDimensionsAtom);

  useEffect(() => {
    if (imageSrc && !stream) {
      const img = new Image();
      img.onload = () => {
        setImageDimensions({
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };
      img.onerror = () => {
        console.error('Failed to load image to determine dimensions:', imageSrc);
      };
      img.src = imageSrc;
    }
  }, [imageSrc, stream, setImageDimensions]);

  const [allAnnotationData] = useAtom(allAnnotationDataAtom);
  const {boxes, masks, points} = allAnnotationData;

  const [editingMaskIndex] = useAtom(editingMaskIndexAtom);
  const [editedMaskPoints, setEditedMaskPoints] = useAtom(editedMaskPointsAtom);
  const [zoom, setZoom] = useAtom(editorZoomAtom);
  const [pan, setPan] = useAtom(editorPanOffsetAtom);
  const [selectedPointIndices, setSelectedPointIndices] = useAtom(
    selectedPointsIndicesAtom,
  );
  const [isPanning, setIsPanning] = useAtom(isPanningAtom);
  const [draggingInfo, setDraggingInfo] = useAtom(draggingPointInfoAtom);
  const [imageDimensions] = useAtom(imageDimensionsAtom);

  const {
    ref: containerRef,
    width: containerWidth = 1,
    height: containerHeight = 1,
  } = useResizeDetector();
  const svgRef = useRef<SVGSVGElement>(null);
  const initRef = useRef(false);

  const activeMask = editingMaskIndex !== null ? masks[editingMaskIndex] : null;

  useEffect(() => {
    if (activeMask && editingMaskIndex !== null && imageDimensions.width > 1) {
      const {width: imageWidth, height: imageHeight} = imageDimensions;
      const {x, y, width, height, maskWidth, maskHeight, points} = activeMask;

      if (points && points.length > 0) {
        const imagePixelX = x * imageWidth;
        const imagePixelY = y * imageHeight;
        const imagePixelWidth = width * imageWidth;
        const imagePixelHeight = height * imageHeight;

        const transformedPoints = points.map((p) => ({
          x: imagePixelX + (p.x / maskWidth) * imagePixelWidth,
          y: imagePixelY + (p.y / maskHeight) * imagePixelHeight,
        }));
        setEditedMaskPoints(transformedPoints);
      } else {
        setEditedMaskPoints([]);
      }
    } else {
      setEditedMaskPoints(null);
    }
    setSelectedPointIndices([]);
  }, [
    editingMaskIndex,
    masks,
    imageDimensions,
    setEditedMaskPoints,
    setSelectedPointIndices,
    activeMask,
  ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === 'Backspace' || e.key === 'Delete') &&
        selectedPointIndices.length > 0
      ) {
        e.preventDefault();
        setEditedMaskPoints((prev) =>
          prev!.filter((_, index) => !selectedPointIndices.includes(index)),
        );
        setSelectedPointIndices([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedPointIndices, setEditedMaskPoints, setSelectedPointIndices]);

  const {contentWidth, contentHeight} = useMemo(() => {
    if (
      !imageDimensions ||
      imageDimensions.width <= 1 ||
      containerWidth <= 1 ||
      containerHeight <= 1
    ) {
      return {contentWidth: 0, contentHeight: 0};
    }
    const imgAspect = imageDimensions.width / imageDimensions.height;
    const containerAspect = containerWidth / containerHeight;
    let newContentWidth, newContentHeight;
    if (imgAspect > containerAspect) {
      newContentWidth = containerWidth;
      newContentHeight = containerWidth / imgAspect;
    } else {
      newContentHeight = containerHeight;
      newContentWidth = containerHeight * imgAspect;
    }
    return {
      contentWidth: newContentWidth,
      contentHeight: newContentHeight,
    };
  }, [imageDimensions, containerWidth, containerHeight]);

  useEffect(() => {
    if (contentWidth > 0) {
      // Reset pan/zoom when image changes or on initial load
      setPan({
        x: (containerWidth - contentWidth) / 2,
        y: (containerHeight - contentHeight) / 2,
      });
      setZoom(1);
      initRef.current = true;
    }
  }, [
    contentWidth,
    contentHeight,
    containerWidth,
    containerHeight,
    imageSrc,
    setPan,
    setZoom,
  ]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const zoomFactor = 1.1;
    const newZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    const clampedZoom = Math.max(0.1, Math.min(newZoom, 20));

    const mouseX = e.clientX - containerRef.current.getBoundingClientRect().left;
    const mouseY = e.clientY - containerRef.current.getBoundingClientRect().top;

    const worldX = (mouseX - pan.x) / zoom;
    const worldY = (mouseY - pan.y) / zoom;

    const newPanX = mouseX - worldX * clampedZoom;
    const newPanY = mouseY - worldY * clampedZoom;

    setZoom(clampedZoom);
    setPan({x: newPanX, y: newPanY});
  };

  const panStartRef = useRef({x: 0, y: 0});
  const dragStartRef = useRef({x: 0, y: 0});

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsPanning(true);
    panStartRef.current = {x: e.clientX - pan.x, y: e.clientY - pan.y};
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
    } else if (draggingInfo.startPoints && editedMaskPoints && activeMask) {
      const dx = (e.clientX - dragStartRef.current.x) / zoom;
      const dy = (e.clientY - dragStartRef.current.y) / zoom;

      const newPoints = [...editedMaskPoints];
      selectedPointIndices.forEach((index) => {
        const startPoint = draggingInfo.startPoints![index];
        newPoints[index] = {
          x: startPoint.x + dx,
          y: startPoint.y + dy,
        };
      });
      setEditedMaskPoints(newPoints);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
    setIsPanning(false);
    setDraggingInfo({startPoints: null});
  };

  const handleNodePointerDown = (e: React.PointerEvent, index: number) => {
    e.stopPropagation();
    if (e.shiftKey) {
      setSelectedPointIndices((prev) =>
        prev.includes(index)
          ? prev.filter((i) => i !== index)
          : [...prev, index],
      );
    } else {
      if (!selectedPointIndices.includes(index)) {
        setSelectedPointIndices([index]);
      }
    }

    dragStartRef.current = {x: e.clientX, y: e.clientY};
    setDraggingInfo({startPoints: editedMaskPoints});
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePathDoubleClick = (e: React.MouseEvent) => {
    if (!svgRef.current || !editedMaskPoints) return;

    const rect = svgRef.current.getBoundingClientRect();
    const clickCoords = {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    };

    let closestSegmentIndex = -1;
    let minDistance = Infinity;

    for (let i = 0; i < editedMaskPoints.length; i++) {
      const p1 = editedMaskPoints[i];
      const p2 = editedMaskPoints[(i + 1) % editedMaskPoints.length];

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;

      if (dx === 0 && dy === 0) continue;

      const t =
        ((clickCoords.x - p1.x) * dx + (clickCoords.y - p1.y) * dy) /
        (dx * dx + dy * dy);
      const clampedT = Math.max(0, Math.min(1, t));

      const closestPointOnSegment = {
        x: p1.x + clampedT * dx,
        y: p1.y + clampedT * dy,
      };

      const dist = Math.hypot(
        clickCoords.x - closestPointOnSegment.x,
        clickCoords.y - closestPointOnSegment.y,
      );

      if (dist < minDistance) {
        minDistance = dist;
        closestSegmentIndex = i;
      }
    }

    if (closestSegmentIndex !== -1) {
      const newPoints = [...editedMaskPoints];
      newPoints.splice(closestSegmentIndex + 1, 0, clickCoords);
      setEditedMaskPoints(newPoints);
    }
  };

  const editedPath = createCurvePath(editedMaskPoints || []);

  if (!imageSrc && !stream) {
    return (
       <div className="flex items-center justify-center h-full text-center text-[var(--text-color-secondary)] p-8">
        <div>
          <svg className="w-16 h-16 mx-auto mb-4 opacity-50"><use href="#camera"></use></svg>
          <h3 className="font-bold">Media Viewer</h3>
          <p>Select an image from the Media Gallery to view it here.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-transparent cursor-grab active:cursor-grabbing overflow-hidden"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{touchAction: 'none'}}>
      {stream && (
        <video
          className="absolute max-w-full max-h-full opacity-0" // Hidden, just for loading metadata
          autoPlay
          onLoadedMetadata={(e) => {
            setImageDimensions({
              width: e.currentTarget.videoWidth,
              height: e.currentTarget.videoHeight,
            });
          }}
          ref={(video) => {
            if (videoRef) videoRef.current = video;
            if (video && !video.srcObject) {
              video.srcObject = stream;
            }
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          width: `${contentWidth}px`,
          height: `${contentHeight}px`,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'top left',
          willChange: 'transform',
        }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${imageDimensions.width} ${imageDimensions.height}`}
          className="absolute inset-0 w-full h-full"
          style={{overflow: 'visible'}}>
          {imageSrc && (
            <image
              href={imageSrc!} // Stream is handled by drawing frames to a canvas if needed, but for now we just show image
              x="0"
              y="0"
              width={imageDimensions.width}
              height={imageDimensions.height}
              style={{imageRendering: 'auto'}} // Prevents pixelation on zoom
            />
          )}

          {/* Render all masks */}
          {masks.map((mask: BoundingBoxMaskType, i: number) => {
            const color = segmentationColors[i % segmentationColors.length];
            // If we are editing THIS mask, it will be rendered again below with its interactive points
            const isBeingEdited = i === editingMaskIndex;
            return (
              <path
                key={`mask-${i}`}
                d={isBeingEdited ? editedPath : mask.path}
                fill={color}
                fillOpacity={isBeingEdited ? 0.5 : 0.4}
                stroke="white"
                strokeWidth={isBeingEdited ? 1.5 / zoom : 0.75 / zoom}
                style={{pointerEvents: isBeingEdited ? 'all' : 'none'}}
                onDoubleClick={isBeingEdited ? handlePathDoubleClick : undefined}
                transform={
                  isBeingEdited
                    ? ''
                    : `translate(${mask.x * imageDimensions.width}, ${
                        mask.y * imageDimensions.height
                      }) scale(${(mask.width * imageDimensions.width) / mask.maskWidth}, ${
                        (mask.height * imageDimensions.height) / mask.maskHeight
                      })`
                }
              />
            );
          })}

          {/* Render all 2D Boxes */}
          {boxes.map((box, i) => {
            const x = box.x * imageDimensions.width;
            const y = box.y * imageDimensions.height;
            const w = box.width * imageDimensions.width;
            const h = box.height * imageDimensions.height;
            const labelY = y - 5 / zoom;
            const labelFontSize = 12 / zoom;

            return (
              <g key={`box-${i}`}>
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill="rgba(127, 187, 255, 0.3)"
                  stroke="var(--accent-color)"
                  strokeWidth={2 / zoom}
                  rx={8 / zoom}
                  ry={8 / zoom}
                  style={{pointerEvents: 'none'}}
                />
                <rect
                  x={x}
                  y={labelY - labelFontSize}
                  width={(box.label.length * labelFontSize * 0.6) + (10 / zoom)}
                  height={labelFontSize + (5 / zoom)}
                  fill="var(--accent-color)"
                  rx={4 / zoom}
                  ry={4 / zoom}
                  style={{pointerEvents: 'none'}}
                />
                <text
                  x={x + 5 / zoom}
                  y={labelY}
                  fill="var(--bg-color)"
                  fontSize={labelFontSize}
                  fontWeight="bold"
                  style={{pointerEvents: 'none'}}>
                  {box.label}
                </text>
              </g>
            );
          })}

          {/* Render all Points */}
          {points.map((p, i) => {
             const cx = p.point.x * imageDimensions.width;
             const cy = p.point.y * imageDimensions.height;
             const labelY = cy - 10 / zoom;
             const labelFontSize = 12 / zoom;
            return (
              <g key={`point-${i}`}>
                 <circle
                  cx={cx}
                  cy={cy}
                  r={5 / zoom}
                  fill="black"
                  fillOpacity={0.5}
                  stroke="white"
                  strokeWidth={1.5 / zoom}
                  style={{pointerEvents: 'none'}}
                />
                 <rect
                  x={cx - ((p.label.length * labelFontSize * 0.6) + (10 / zoom))/2}
                  y={labelY - labelFontSize}
                  width={(p.label.length * labelFontSize * 0.6) + (10 / zoom)}
                  height={labelFontSize + (5 / zoom)}
                  fill="black"
                  rx={4 / zoom}
                  ry={4 / zoom}
                  style={{pointerEvents: 'none'}}
                />
                <text
                  x={cx}
                  y={labelY}
                  fill="white"
                  fontSize={labelFontSize}
                  textAnchor='middle'
                  style={{pointerEvents: 'none'}}>
                  {p.label}
                </text>
              </g>
            );
          })}

          {/* Render editable points for the active mask */}
          {editingMaskIndex !== null &&
            editedMaskPoints?.map((p, index) => (
              <circle
                key={`handle-${index}`}
                cx={p.x}
                cy={p.y}
                r={5 / zoom}
                fill={
                  selectedPointIndices.includes(index) ? '#3B68FF' : 'white'
                }
                stroke={
                  selectedPointIndices.includes(index) ? 'white' : '#3B68FF'
                }
                strokeWidth={1.5 / zoom}
                className="cursor-move"
                onPointerDown={(e) => handleNodePointerDown(e, index)}
              />
            ))}
        </svg>
      </div>
    </div>
  );
}
