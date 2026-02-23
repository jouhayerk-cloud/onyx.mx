import { supabase } from './supabase';

export const uploadImage = async (dataUrl: string, path: string) => {
    // Convert dataUrl to blob
    const res = await fetch(dataUrl);
    const blob = await res.blob();

    const { data, error } = await supabase.storage
        .from('onyx-media')
        .upload(path, blob, {
            contentType: blob.type,
            upsert: true
        });

    if (error) throw error;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
        .from('onyx-media')
        .getPublicUrl(data.path);

    return publicUrl;
};
