import type { MetadataRoute } from 'next';

/**
 * The portfolio stays fully indexable — that is the point of it.
 *
 * The career dashboard does not. It is reachable by link, so Johnny can open it
 * on a phone or hand the read-only view to a manager, but it is a private
 * ledger and has no business turning up in a search for his name. A `/career`
 * entry is a prefix match, so it covers the whole tree including
 * /career/admin and every goal page beneath it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/career', '/api/'],
      },
    ],
  };
}
