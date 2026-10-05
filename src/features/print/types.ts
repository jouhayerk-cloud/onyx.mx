import type React from 'react';

export type DocumentKind = 'xlsx' | 'pdf' | 'label' | 'csv';
export type DocumentChannel = 'browser-download' | `phomemo:${string}` | 'print-dialog';
export type SeasonScope = '826' | 'legacy';
export type DocumentStatus = 'requested' | 'rendered' | 'printed' | 'downloaded' | 'reprinted' | 'void';
export type DocumentRole = string;

export interface RenderResult {
    bytes?: Uint8Array;
    blob?: Blob;
    mime: string;
    fileName: string;
    pageCount?: number;
    labelCount?: number;
}

export interface DocumentType<TSource, TSnapshot> {
    id: string;
    kind: DocumentKind;
    label: () => string;
    i18nReady: boolean;
    icon: React.ElementType;
    group: string;
    module: string;
    templateVersion: string;
    allowedRoles: DocumentRole[];
    seasonScoping: 'strict' | 'mixed' | 'none';
    requiredData: (params: TSource) => Promise<TSnapshot>;
    buildSnapshot: (source: TSnapshot, params: TSource) => any;
    render: (snapshot: any, params: TSource) => Promise<RenderResult>;
}

export interface JobRequest<TSource> {
    typeId: string;
    params: TSource;
    season: SeasonScope;
    workbook?: string;
    manifestId?: string;
    crateId?: string;
    batchId?: string;
    items?: { inventoryId: string; season: SeasonScope; tagId?: string; copies: number; crateId?: string }[];
    channel?: DocumentChannel;
    parentJobId?: string;
    legacyPrintJobId?: string;
}

export interface JobResult {
    jobId: string;
    jobRef: string;
    dataHash: string;
    outputSha256?: string;
}
