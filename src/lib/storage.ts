import { supabase } from './supabase';

export const uploadMedia = async (file: File | Blob, path: string) => {
    // Native upload of the file/blob to Supabase Storage
    const { data, error } = await supabase.storage
        .from('onyx-media')
        .upload(path, file, {
            contentType: file.type,
            upsert: true,
            cacheControl: '3600'
        });

    if (error) {
        console.error('[Storage] Upload failed:', error);
        throw error;
    }

    // Get the public URL for the newly uploaded file
    const { data: { publicUrl } } = supabase.storage
        .from('onyx-media')
        .getPublicUrl(data.path);

    return publicUrl;
};

// Legacy compatibility wrapper
export const uploadImage = async (dataUrl: string, path: string) => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return uploadMedia(blob, path);
};
