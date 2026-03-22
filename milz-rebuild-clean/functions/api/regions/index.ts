import { json } from '../../_shared/response';

export const onRequestGet: PagesFunction = async () => json({
  data: ['hawaii', 'new-york', 'tokyo', 'kyoto', 'osaka', 'korea'],
});
