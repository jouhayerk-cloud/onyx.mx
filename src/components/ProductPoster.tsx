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

import React, {useRef} from 'react';
import toast from 'react-hot-toast';
import {InventoryItemData} from '../lib/Types';

interface ProductPosterProps {
  item: InventoryItemData;
  imageUrl: string | null;
}

export function ProductPoster({item, imageUrl}: ProductPosterProps) {
  const posterRef = useRef<HTMLDivElement>(null);

  const posterStyles = `
    .product-poster-embed {
      font-family: 'Atkinson Hyperlegible', sans-serif;
      background-color: #0a0a0a;
      color: #f0f0f0;
      width: 350px;
      border: 1px solid #333;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .product-poster-embed img {
      width: 100%;
      height: 250px;
      object-fit: cover;
    }
    .product-poster-embed .content {
      padding: 20px;
      text-align: left;
    }
    .product-poster-embed .title {
      font-size: 24px;
      font-weight: bold;
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .product-poster-embed .subtitle {
      font-size: 16px;
      color: #a0a0a0;
      margin: 4px 0 0 0;
    }
    .product-poster-embed .description {
      font-size: 14px;
      margin-top: 16px;
      line-height: 1.6;
      color: #ccc;
    }
    .product-poster-embed .specs {
      margin-top: 20px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      font-size: 12px;
    }
    .product-poster-embed .spec-item {
      padding-left: 12px;
      border-left: 2px solid #7FBBFF;
    }
    .product-poster-embed .spec-label {
      text-transform: uppercase;
      color: #a0a0a0;
    }
    .product-poster-embed .spec-value {
      font-weight: bold;
      font-size: 14px;
    }
  `;

  const handleCopyEmbedCode = () => {
    if (posterRef.current) {
      const htmlContent = `<style>${posterStyles}</style>${posterRef.current.outerHTML}`;
      navigator.clipboard.writeText(htmlContent);
      toast.success('Embed code copied to clipboard!');
    }
  };

  const {
    shape,
    material,
    detailedDescription,
    widthCm,
    heightCm,
    lengthCm,
    weightKg,
    price,
  } = item;
  const dimensions = [widthCm, heightCm, lengthCm].filter(Boolean).join(' x ');

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        ref={posterRef}
        className="product-poster-embed"
        style={{fontFamily: "'Atkinson Hyperlegible', sans-serif"}}>
        {imageUrl && <img src={imageUrl} alt={shape} />}
        <div className="content">
          <h1 className="title">{shape}</h1>
          <p className="subtitle">{material}</p>
          {detailedDescription && (
            <div
              className="description"
              dangerouslySetInnerHTML={{__html: detailedDescription}}
            />
          )}
          <div className="specs">
            {dimensions && (
              <div className="spec-item">
                <div className="spec-label">Dimensions</div>
                <div className="spec-value">{dimensions} cm</div>
              </div>
            )}
            {weightKg && (
              <div className="spec-item">
                <div className="spec-label">Weight</div>
                <div className="spec-value">{weightKg} kg</div>
              </div>
            )}
            {price && (
              <div className="spec-item">
                <div className="spec-label">Price</div>
                <div className="spec-value">${price} MXN</div>
              </div>
            )}
          </div>
        </div>
      </div>
      <button className="button w-full" onClick={handleCopyEmbedCode}>
        Copy Embed Code
      </button>
    </div>
  );
}