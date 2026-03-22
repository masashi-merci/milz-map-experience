import { json } from '../../_shared/response';

export const onRequestGet: PagesFunction = async () => json({ data: [] });
export const onRequestPost: PagesFunction = async () => json({ ok: true });
