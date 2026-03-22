
import { json } from '../../_shared/response';

export const onRequestPost: PagesFunction<{ ASSETS?: R2Bucket; R2_PUBLIC_BASE_URL?: string }> = async ({ request, env }) => {
  try {
    if (!env.ASSETS) return json({ error: 'R2 binding ASSETS が未設定です。' }, 500);
    const form = await request.formData();
    const file = form.get('file');
    const spotId = String(form.get('spotId') || 'spot');
    if (!(file instanceof File)) return json({ error: '画像ファイルが見つかりません。' }, 400);

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const key = `spots/${spotId}/${Date.now()}.${ext}`;
    await env.ASSETS.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || 'image/jpeg' },
    });

    const publicBaseUrl = env.R2_PUBLIC_BASE_URL || '';
    const publicUrl = publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, '')}/${key}` : key;
    return json({ key, publicUrl });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'upload failed' }, 500);
  }
};
